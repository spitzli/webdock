use std::{
    os::unix::fs::MetadataExt,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    time::Duration,
};
use tokio::sync::{mpsc, oneshot};
use tonic::{Request, Response, Status};
use webdock_plugin_runtime::{HostClient, UnixSocket, wire};

#[derive(Clone)]
struct Host {
    mode: Arc<AtomicUsize>,
    attempts: mpsc::UnboundedSender<()>,
    release: Arc<tokio::sync::Notify>,
}
#[tonic::async_trait]
impl wire::plugin_host_server::PluginHost for Host {
    async fn authorize_peer(
        &self,
        request: Request<wire::HostPeerRequest>,
    ) -> Result<Response<wire::HostAuthorityResponse>, Status> {
        let request = request.into_inner();
        assert_eq!(
            (request.plugin_id.as_str(), request.generation),
            ("mail", 2)
        );
        let mode = self.mode.load(Ordering::SeqCst);
        let _ = self.attempts.send(());
        match mode {
            0 => Ok(Response::new(wire::HostAuthorityResponse { active: false })),
            1 => Ok(Response::new(wire::HostAuthorityResponse { active: true })),
            2 => Err(Status::unavailable("fixture outage")),
            _ => {
                self.release.notified().await;
                Ok(Response::new(wire::HostAuthorityResponse {
                    active: self.mode.load(Ordering::SeqCst) == 1,
                }))
            }
        }
    }
    async fn authorize_invocation(
        &self,
        _: Request<wire::HostInvocationRequest>,
    ) -> Result<Response<wire::HostAuthorityResponse>, Status> {
        Err(Status::permission_denied("unused"))
    }
    async fn authorize_request(
        &self,
        _: Request<wire::HostPayloadRequest>,
    ) -> Result<Response<wire::HostAuthorityResponse>, Status> {
        Err(Status::permission_denied("unused"))
    }
    async fn call(
        &self,
        _: Request<wire::HostCallRequest>,
    ) -> Result<Response<wire::HostCallResponse>, Status> {
        Err(Status::permission_denied("unused"))
    }
    async fn workloads(
        &self,
        _: Request<wire::HostWorkloadRequest>,
    ) -> Result<Response<wire::HostCallResponse>, Status> {
        Err(Status::permission_denied("unused"))
    }
}
struct Fixture {
    task: tokio::task::JoinHandle<()>,
    directory: PathBuf,
    client: HostClient,
    host: Host,
    attempts: mpsc::UnboundedReceiver<()>,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.task.abort();
        let _ = std::fs::remove_dir_all(&self.directory);
    }
}
impl Fixture {
    async fn new() -> Self {
        use std::os::unix::fs::DirBuilderExt;
        let directory =
            std::env::temp_dir().join(format!("mail-startup-{}", uuid::Uuid::new_v4().simple()));
        std::fs::DirBuilder::new()
            .mode(0o700)
            .create(&directory)
            .unwrap();
        let path = directory.join("core.sock");
        let mut socket = UnixSocket::bind(&path).unwrap();
        let incoming = socket.incoming().unwrap();
        let (attempts, receiver) = mpsc::unbounded_channel();
        let host = Host {
            mode: Arc::default(),
            attempts,
            release: Arc::default(),
        };
        let service = wire::plugin_host_server::PluginHostServer::new(host.clone());
        let task = tokio::spawn(async move {
            let _socket = socket;
            tonic::transport::Server::builder()
                .add_service(service)
                .serve_with_incoming(incoming)
                .await
                .unwrap();
        });
        let client = HostClient::connect_unix(path).await.unwrap();
        Self {
            task,
            directory,
            client,
            host,
            attempts: receiver,
        }
    }
    async fn attempt(&mut self) {
        tokio::time::timeout(Duration::from_secs(3), self.attempts.recv())
            .await
            .unwrap()
            .unwrap();
    }
}

async fn serve_until_listener_exit<S, F, R, E>(
    server: S,
    client: HostClient,
    plugin: &str,
    generation: u64,
    resume: F,
) -> Result<(), crate::Error>
where
    S: std::future::Future<Output = Result<(), crate::Error>>,
    F: FnMut() -> R,
    R: std::future::Future<Output = Result<(), E>>,
{
    super::serve(
        |_| server,
        std::future::pending(),
        client,
        plugin,
        generation,
        resume,
    )
    .await
}

#[tokio::test]
async fn candidate_and_outage_have_no_resume_effects_then_promotion_resumes_automatically() {
    let mut f = Fixture::new().await;
    let serving = Arc::new(AtomicBool::new(false));
    let ready = serving.clone();
    let (stop, stopped) = oneshot::channel();
    let server = async move {
        ready.store(true, Ordering::SeqCst);
        let _ = stopped.await;
        Ok(())
    };
    let (resumed, mut effects) = mpsc::unbounded_channel();
    let task = tokio::spawn(serve_until_listener_exit(
        server,
        f.client.clone(),
        "mail",
        2,
        move || {
            assert!(
                serving.load(Ordering::SeqCst),
                "listener must be polled first"
            );
            resumed.send(()).unwrap();
            std::future::ready(Ok::<(), ()>(()))
        },
    ));
    f.attempt().await;
    assert!(effects.try_recv().is_err());
    f.host.mode.store(2, Ordering::SeqCst);
    f.attempt().await;
    assert!(effects.try_recv().is_err());
    f.host.mode.store(1, Ordering::SeqCst);
    tokio::time::timeout(Duration::from_secs(3), effects.recv())
        .await
        .unwrap()
        .unwrap();
    stop.send(()).unwrap();
    task.await.unwrap().unwrap();
    assert!(effects.try_recv().is_err());
}

#[tokio::test]
async fn failed_resume_requires_fresh_authority_before_retrying() {
    let mut f = Fixture::new().await;
    f.host.mode.store(1, Ordering::SeqCst);
    let mode = f.host.mode.clone();
    let calls = Arc::new(AtomicUsize::new(0));
    let count = calls.clone();
    let (resumed, mut effects) = mpsc::unbounded_channel();
    let (stop, stopped) = oneshot::channel();
    let server = async {
        let _ = stopped.await;
        Ok(())
    };
    let task = tokio::spawn(serve_until_listener_exit(
        server,
        f.client.clone(),
        "mail",
        2,
        move || {
            let first = count.fetch_add(1, Ordering::SeqCst) == 0;
            if first {
                mode.store(0, Ordering::SeqCst);
            }
            resumed.send(()).unwrap();
            std::future::ready(if first { Err(()) } else { Ok(()) })
        },
    ));
    tokio::time::timeout(Duration::from_secs(3), effects.recv())
        .await
        .unwrap()
        .unwrap();
    f.attempt().await;
    f.attempt().await;
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    f.host.mode.store(1, Ordering::SeqCst);
    tokio::time::timeout(Duration::from_secs(3), effects.recv())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    stop.send(()).unwrap();
    task.await.unwrap().unwrap();
}

#[tokio::test]
async fn listener_shutdown_cancels_an_inflight_authorization_without_resume() {
    let mut f = Fixture::new().await;
    f.host.mode.store(3, Ordering::SeqCst);
    let calls = Arc::new(AtomicUsize::new(0));
    let count = calls.clone();
    let (stop, stopped) = oneshot::channel();
    let server = async {
        let _ = stopped.await;
        Ok(())
    };
    let task = tokio::spawn(serve_until_listener_exit(
        server,
        f.client.clone(),
        "mail",
        2,
        move || {
            count.fetch_add(1, Ordering::SeqCst);
            std::future::ready(Ok::<(), ()>(()))
        },
    ));
    f.attempt().await;
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(1), task)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn listener_failure_cancels_backoff_without_later_resume() {
    let mut f = Fixture::new().await;
    let calls = Arc::new(AtomicUsize::new(0));
    let count = calls.clone();
    let (stop, stopped) = oneshot::channel();
    let server = async {
        let _ = stopped.await;
        Err("fixture listener failed".into())
    };
    let task = tokio::spawn(serve_until_listener_exit(
        server,
        f.client.clone(),
        "mail",
        2,
        move || {
            count.fetch_add(1, Ordering::SeqCst);
            std::future::ready(Ok::<(), ()>(()))
        },
    ));
    f.attempt().await;
    // The RPC has replied inactive; let the client enter its backoff wait.
    tokio::time::sleep(Duration::from_millis(20)).await;
    stop.send(()).unwrap();
    let error = tokio::time::timeout(Duration::from_secs(1), task)
        .await
        .unwrap()
        .unwrap()
        .unwrap_err();
    assert_eq!(error.to_string(), "fixture listener failed");
    f.host.mode.store(1, Ordering::SeqCst);
    tokio::time::sleep(Duration::from_millis(150)).await;
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    assert!(
        f.attempts.try_recv().is_err(),
        "cancelled startup must not keep polling"
    );
}

#[tokio::test]
async fn listener_shutdown_drops_an_inflight_resume_future() {
    struct Dropped(Arc<AtomicBool>);
    impl Drop for Dropped {
        fn drop(&mut self) {
            self.0.store(true, Ordering::SeqCst);
        }
    }
    let f = Fixture::new().await;
    f.host.mode.store(1, Ordering::SeqCst);
    let dropped = Arc::new(AtomicBool::new(false));
    let flag = dropped.clone();
    let (entered, mut resumes) = mpsc::unbounded_channel();
    let (stop, stopped) = oneshot::channel();
    let server = async {
        let _ = stopped.await;
        Ok(())
    };
    let task = tokio::spawn(serve_until_listener_exit(
        server,
        f.client.clone(),
        "mail",
        2,
        move || {
            let guard = Dropped(flag.clone());
            entered.send(()).unwrap();
            async move {
                let _guard = guard;
                std::future::pending::<Result<(), ()>>().await
            }
        },
    ));
    tokio::time::timeout(Duration::from_secs(3), resumes.recv())
        .await
        .unwrap()
        .unwrap();
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(1), task)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert!(dropped.load(Ordering::SeqCst));
}

#[tokio::test]
async fn shutdown_prevents_resume_when_callback_grants_during_real_graceful_drain() {
    let mut f = Fixture::new().await;
    f.host.mode.store(3, Ordering::SeqCst);
    let (attempts, mut drain_attempts) = mpsc::unbounded_channel();
    let drain_host = Host {
        mode: Arc::new(AtomicUsize::new(3)),
        attempts,
        release: Arc::default(),
    };
    let path = f.directory.join("drain.sock");
    let mut socket = UnixSocket::bind(&path).unwrap();
    let incoming = socket.incoming().unwrap();
    let service = wire::plugin_host_server::PluginHostServer::new(drain_host.clone());
    let (signal, shutdown) = oneshot::channel();
    let (draining, drain_started) = oneshot::channel();
    let server = move |stopped: oneshot::Receiver<()>| async move {
        let _socket = socket;
        tonic::transport::Server::builder()
            .add_service(service)
            .serve_with_incoming_shutdown(incoming, async {
                let _ = stopped.await;
                let _ = draining.send(());
            })
            .await?;
        Ok(())
    };
    let (resumed, mut effects) = mpsc::unbounded_channel();
    let task = tokio::spawn(super::serve(
        server,
        async {
            let _ = shutdown.await;
        },
        f.client.clone(),
        "mail",
        2,
        move || {
            let _ = resumed.send(());
            std::future::ready(Ok::<(), ()>(()))
        },
    ));
    f.attempt().await;
    let mut draining_client = wire::plugin_host_client::PluginHostClient::new(
        webdock_plugin_runtime::unix_channel(path).await.unwrap(),
    );
    let request = tokio::spawn(async move {
        draining_client
            .authorize_peer(wire::HostPeerRequest {
                plugin_id: "mail".into(),
                generation: 2,
            })
            .await
    });
    tokio::time::timeout(Duration::from_secs(1), drain_attempts.recv())
        .await
        .unwrap()
        .unwrap();
    signal.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(1), drain_started)
        .await
        .unwrap()
        .unwrap();
    assert!(
        !task.is_finished(),
        "real pending RPC must hold graceful drain open"
    );
    f.host.mode.store(1, Ordering::SeqCst);
    f.host.release.notify_waiters();
    let resumed_after_shutdown = matches!(
        tokio::time::timeout(Duration::from_millis(300), effects.recv()).await,
        Ok(Some(()))
    );
    assert!(
        !task.is_finished(),
        "drain remains blocked independently of callback grant"
    );
    drain_host.release.notify_waiters();
    request.await.unwrap().unwrap();
    tokio::time::timeout(Duration::from_secs(1), task)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert!(
        !resumed_after_shutdown,
        "shutdown must fence resume before graceful drain completes"
    );
}

#[tokio::test]
async fn initially_offline_callback_preserves_discovery_then_resumes_when_available() {
    struct NoActions;
    #[tonic::async_trait]
    impl webdock_plugin_runtime::ActionHandler for NoActions {
        async fn invoke(
            &self,
            _: &webdock_plugin_protocol::InvocationClaims,
            _: &str,
            _: serde_json::Value,
            _: serde_json::Value,
        ) -> Result<serde_json::Value, webdock_plugin_protocol::PluginError> {
            panic!("discovery must not invoke a product action");
        }
    }
    let mut f = Fixture::new().await;
    f.task.abort();
    let _ = (&mut f.task).await;
    let core_path = f.directory.join("core.sock");
    assert!(!core_path.exists());
    let path = f.directory.join("plugin.sock");
    let transport = webdock_plugin_kit::transport::RuntimeTransport {
        listen: Some(path.clone()),
        core: Some(core_path.clone()),
        ..Default::default()
    };
    let client = transport.core_client_lazy().await.unwrap();
    let authority = webdock_plugin_runtime::RemoteAuthority::new(
        client.clone(),
        "mail".into(),
        2,
        vec![webdock_plugin_runtime::CorePeer::Unix {
            uid: std::fs::metadata(&f.directory).unwrap().uid(),
        }],
    )
    .unwrap();
    let runtime = webdock_plugin_runtime::Runtime::new(
        webdock_plugin_protocol::Manifest::parse(include_bytes!("../manifest.json")).unwrap(),
        2,
        ed25519_dalek::SigningKey::from_bytes(&[71; 32]).verifying_key(),
        Arc::new(authority),
        Arc::new(NoActions),
    )
    .unwrap();
    let socket = UnixSocket::bind(&path).unwrap();
    let (stop, stopped) = oneshot::channel();
    let (resumed, mut effects) = mpsc::unbounded_channel();
    let task = tokio::spawn(super::serve(
        |drain| async {
            Ok(runtime
                .serve_unix(socket, async {
                    let _ = drain.await;
                })
                .await?)
        },
        async {
            let _ = stopped.await;
        },
        client,
        "mail",
        2,
        move || {
            let _ = resumed.send(());
            std::future::ready(Ok::<(), ()>(()))
        },
    ));
    let mut probe = webdock_plugin_runtime::connect_unix(path).await.unwrap();
    let health = probe
        .health(wire::HealthRequest {})
        .await
        .unwrap()
        .into_inner();
    assert_eq!((health.plugin_id.as_str(), health.generation), ("mail", 2));
    assert!(
        !probe
            .describe(wire::DescribeRequest {})
            .await
            .unwrap()
            .into_inner()
            .manifest_json
            .is_empty()
    );
    assert!(effects.try_recv().is_err());
    let mut socket = UnixSocket::bind(core_path).unwrap();
    let incoming = socket.incoming().unwrap();
    f.host.mode.store(1, Ordering::SeqCst);
    let service = wire::plugin_host_server::PluginHostServer::new(f.host.clone());
    f.task = tokio::spawn(async move {
        let _socket = socket;
        tonic::transport::Server::builder()
            .add_service(service)
            .serve_with_incoming(incoming)
            .await
            .unwrap();
    });
    tokio::time::timeout(Duration::from_secs(3), effects.recv())
        .await
        .unwrap()
        .unwrap();
    drop(probe);
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(1), task)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
}

#[tokio::test]
async fn shutdown_signal_remains_polled_after_resume_completes() {
    let f = Fixture::new().await;
    f.host.mode.store(1, Ordering::SeqCst);
    let (signal, shutdown) = oneshot::channel();
    let (draining, drain_started) = oneshot::channel();
    let (release, drain_finished) = oneshot::channel();
    let (resumed, mut effects) = mpsc::unbounded_channel();
    let task = tokio::spawn(super::serve(
        |drain| async {
            let _ = drain.await;
            let _ = draining.send(());
            let _ = drain_finished.await;
            Ok(())
        },
        async {
            let _ = shutdown.await;
        },
        f.client.clone(),
        "mail",
        2,
        move || {
            let _ = resumed.send(());
            std::future::ready(Ok::<(), ()>(()))
        },
    ));
    tokio::time::timeout(Duration::from_secs(1), effects.recv())
        .await
        .unwrap()
        .unwrap();
    signal.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(1), drain_started)
        .await
        .unwrap()
        .unwrap();
    assert!(!task.is_finished());
    release.send(()).unwrap();
    task.await.unwrap().unwrap();
}

#[tokio::test]
async fn direct_shutdown_drops_resume_before_server_drain_finishes() {
    struct Dropped(Arc<AtomicBool>);
    impl Drop for Dropped {
        fn drop(&mut self) {
            self.0.store(true, Ordering::SeqCst);
        }
    }
    let f = Fixture::new().await;
    f.host.mode.store(1, Ordering::SeqCst);
    let dropped = Arc::new(AtomicBool::new(false));
    let flag = dropped.clone();
    let (signal, shutdown) = oneshot::channel();
    let (draining, drain_started) = oneshot::channel();
    let (release, drain_finished) = oneshot::channel();
    let (entered, mut resumes) = mpsc::unbounded_channel();
    let task = tokio::spawn(super::serve(
        |drain| async {
            let _ = drain.await;
            let _ = draining.send(());
            let _ = drain_finished.await;
            Ok(())
        },
        async {
            let _ = shutdown.await;
        },
        f.client.clone(),
        "mail",
        2,
        move || {
            let guard = Dropped(flag.clone());
            let _ = entered.send(());
            async move {
                let _guard = guard;
                std::future::pending::<Result<(), ()>>().await
            }
        },
    ));
    tokio::time::timeout(Duration::from_secs(1), resumes.recv())
        .await
        .unwrap()
        .unwrap();
    signal.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(1), drain_started)
        .await
        .unwrap()
        .unwrap();
    assert!(dropped.load(Ordering::SeqCst));
    assert!(
        !task.is_finished(),
        "resume cancellation must not wait for drain completion"
    );
    release.send(()).unwrap();
    task.await.unwrap().unwrap();
}
