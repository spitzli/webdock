//! Reuses the hosting fixture: no duplicate cluster setup, no production resources.
use super::browser;
use super::*;
mod registry;
use webdock_build::{BuildService, RepositoryProvider, RepositoryRef, VerifiedCommit};
struct LocalRepository {
    path: tempfile::TempDir,
}
#[async_trait::async_trait]
impl RepositoryProvider for LocalRepository {
    async fn resolve(
        &self,
        _: &RepositoryRef<'_>,
        reference: &str,
    ) -> webdock_build::Result<VerifiedCommit> {
        let output = std::process::Command::new("git")
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .arg("-C")
            .arg(self.path.path())
            .args(["rev-parse", "--verify", &format!("{reference}^{{commit}}")])
            .output()
            .unwrap();
        assert!(output.status.success());
        VerifiedCommit::new(String::from_utf8(output.stdout).unwrap().trim().into())
    }
    async fn archive(&self, _: &RepositoryRef<'_>, commit: &str) -> webdock_build::Result<Vec<u8>> {
        let output = std::process::Command::new("git")
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .arg("-C")
            .arg(self.path.path())
            .args(["archive", "--format=tar", commit])
            .output()
            .unwrap();
        assert!(output.status.success());
        Ok(output.stdout)
    }
}
#[tokio::test]
#[ignore = "owned restricted RLS fixture plus native0012 and real VM artifact"]
async fn git_build_publication_preserves_durable_authority_and_atomic_hosting() {
    let fixture = Arc::new(Fixture::new("kubernetes").await);
    let browser_fixture = Arc::new(browser::BrowserFixture::new(&fixture).await);
    let browser = browser_fixture.clone();
    let f = fixture.clone();
    let worker_id = id(&f.owner).await;
    let connection = id(&f.owner).await;
    let cleanup_worker = worker_id.clone();
    let cleanup_connection = connection.clone();
    let outcome=tokio::spawn(async move {
 f.configure("k3s").await;
 let registry=registry::LocalRegistry::start().await;let publisher=webdock_build::publisher::RegistryPublisher::loopback_test(registry.address).unwrap();
 sql(&f.owner,"UPDATE webdock_auth.hosting_agent SET observation=jsonb_set(observation,'{capabilities,registryVersion}','1') WHERE cluster_id=$1",vec![f.cluster.clone().into()]).await;
 let mut draft_spec=spec();draft_spec.as_object_mut().unwrap().remove("image");draft_spec.as_object_mut().unwrap().remove("template");
 let draft=f.service.execute(&f.principal,json!({"action":"apps.prepare","projectID":f.pid,"name":"git-target","spec":draft_spec,"subscriptionRevision":1,"idempotencyKey":"git-target-draft-1"})).await.unwrap();
 let app=draft["appID"].as_str().or_else(||draft["id"].as_str()).unwrap();
 sql(&f.owner,"INSERT INTO webdock_auth.git_connection(id,customer_id,installation_id,account_id,account_login,permissions,state) VALUES($1,$2,$3,$3,'local-fixture','{}','active')",vec![connection.clone().into(),f.cid.clone().into(),f.nonce.clone().into()]).await;
 sql(&f.owner,"INSERT INTO webdock_auth.git_repository(connection_id,customer_id,repository_id,metadata) VALUES($1,$2,'123456','{\"fullName\":\"fixture/local\"}')",vec![connection.clone().into(),f.cid.clone().into()]).await;
 use base64::Engine;let credential=base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(f.nonce.as_bytes()));sql(&f.owner,"INSERT INTO webdock_auth.git_worker(id,credential_hash,enabled,country,isolation,evidence,capacity) VALUES($1,$2,true,'ZZ','microvm','unverified local disposable test worker',1)",vec![worker_id.clone().into(),hex::encode(Sha256::digest(credential.as_bytes())).into()]).await;
 let repository=LocalRepository{path:tempfile::tempdir().unwrap()};
 let vm_root=std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.runtime-test/build-vm").canonicalize().unwrap();
 std::fs::write(repository.path.path().join("Dockerfile"),"FROM scratch\nCOPY --chmod=755 busybox /bin/busybox\nCOPY --chmod=755 musl /lib/ld-musl-x86_64.so.1\nSHELL [\"/bin/busybox\",\"sh\",\"-c\"]\nARG BUILD_TOKEN\nRUN echo source-commit-built-in-isolated-vm; echo $BUILD_TOKEN\nENTRYPOINT [\"/bin/busybox\",\"true\"]\n").unwrap();
 std::fs::copy(vm_root.join("rootfs/bin/busybox"),repository.path.path().join("busybox")).unwrap();std::fs::copy(vm_root.join("rootfs/lib/ld-musl-x86_64.so.1"),repository.path.path().join("musl")).unwrap();for args in [vec!["init","-b","main"],vec!["add","Dockerfile","busybox","musl"],vec!["-c","user.name=Fixture","-c","user.email=fixture@example.invalid","commit","-m","fixture"]]{assert!(std::process::Command::new("git").env("GIT_CONFIG_GLOBAL","/dev/null").env("GIT_CONFIG_NOSYSTEM","1").arg("-C").arg(repository.path.path()).args(args).output().unwrap().status.success());}
 let mut auth_options=sea_orm::ConnectOptions::new(std::env::var("AUTH_DATABASE_URL").unwrap());auth_options.max_connections(1).acquire_timeout(std::time::Duration::from_secs(1));let auth=Database::connect(auth_options).await.unwrap();
 let hosting=Arc::new(HostingService::new(db("DATABASE_URL").await,auth.clone(),db("WEBDOCK_PLUGIN_WORKER_DATABASE_URL").await,std::env::var("DATABASE_RLS_SECRET").unwrap(),std::env::var("BETTER_AUTH_SECRET").unwrap(),Arc::new(webdock_persistence::IdAllocator::new(db("DATABASE_URL").await,webdock_ids::Identity::platform(0,2).unwrap()))).await.unwrap().with_session_authority(browser.identity.clone(),Some(browser.browser.clone())));
 let service=Arc::new(BuildService::new(db("DATABASE_URL").await,db("WEBDOCK_PLUGIN_WORKER_DATABASE_URL").await,std::env::var("DATABASE_RLS_SECRET").unwrap(),Arc::new(webdock_persistence::IdAllocator::new(db("DATABASE_URL").await,webdock_ids::Identity::platform(0,2).unwrap())),hosting.clone(),registry.address.to_string()).await.unwrap().with_session_authority(auth,browser.identity.clone(),Some(browser.browser.clone())).await.unwrap().with_repository_provider(Arc::new(repository)));

 let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();let address=listener.local_addr().unwrap();let lose_ack=Arc::new(std::sync::atomic::AtomicBool::new(true));
 let router=webdock_build::http::worker_router(service.clone()).layer(axum::middleware::from_fn(move|request:axum::extract::Request,next:axum::middleware::Next|{let lost=lose_ack.clone();async move{let complete=request.uri().path()=="/complete";let response=next.run(request).await;if complete&&response.status().is_success()&&lost.swap(false,std::sync::atomic::Ordering::SeqCst){use axum::response::IntoResponse;axum::http::StatusCode::SERVICE_UNAVAILABLE.into_response()}else{response}}}));
 struct ServerGuard(tokio::task::JoinHandle<()>);impl Drop for ServerGuard{fn drop(&mut self){self.0.abort();}}
 let _server=ServerGuard(tokio::spawn(async move{axum::serve(listener,router).await.unwrap()}));let control=webdock_build::worker::ControlClient::loopback_test(&format!("http://{address}"),credential.clone()).unwrap();
 let _source=service.execute(&f.principal,json!({"action":"git.source.configure","projectID":f.pid,"targetID":app,"connectionID":connection,"repositoryID":"123456","branch":"main","rootDirectory":".","recipe":"dockerfile","revision":0,"autoPublish":true,"buildEnvironment":[{"name":"BUILD_TOKEN","value":"sensitive-fixture-123"}]})).await.unwrap();
 let requested=service.execute(&f.principal,json!({"action":"git.builds.request","projectID":f.pid,"targetID":app,"idempotencyKey":"git-build-request-1"})).await.unwrap();let build=requested["id"].as_str().unwrap();let worker=service.authenticate_worker(&credential).await.unwrap();
 let claim=control.post("claim",&json!({})).await.unwrap();assert_eq!(claim["buildID"],build);let generation=claim["generation"].as_i64().unwrap() as i32;assert!(service.claim_build(&worker).await.unwrap().is_none());assert!(service.guard_build(&worker,build,generation+1).await.is_err());let archive=control.archive(build,generation).await.unwrap();assert!(webdock_build::artifact::Archive::read(&archive,128*1024*1024).unwrap().files().contains_key("Dockerfile"));
 let store_dir=tempfile::tempdir().unwrap();use std::os::unix::fs::PermissionsExt;std::fs::set_permissions(store_dir.path(),std::fs::Permissions::from_mode(0o700)).unwrap();let store=webdock_build::artifact::ArtifactStore::open(store_dir.path().into(),1024*1024*1024).unwrap();

 assert_eq!(std::env::var("WEBDOCK_BUILD_VM_TEST").as_deref(),Ok("1"));
 let vm_control=control.clone();let vm_build=build.to_owned();let handle=tokio::runtime::Handle::current();let job=serde_json::from_value(claim["request"].clone()).unwrap();
 let built=tokio::task::spawn_blocking(move||{let hashes=std::fs::read_to_string(vm_root.join("SHA256SUMS")).unwrap();let expected=|name:&str|hashes.lines().find(|l|l.ends_with(&format!("/{name}"))).unwrap().split_whitespace().next().unwrap().to_owned();let image=webdock_build::execution::VmImage::new(vm_root.join("base.raw"),expected("base.raw")).unwrap().with_boot(vm_root.join("kernel"),expected("kernel"),vm_root.join("initrd"),expected("initrd")).unwrap();let scratch=tempfile::tempdir_in(&vm_root).unwrap();image.execute(&job,&archive,scratch.path(),||handle.block_on(vm_control.guard_build(&vm_build,generation)))}).await.unwrap().unwrap();
 assert!(built.logs.contains("source-commit-built-in-isolated-vm"));assert!(!built.logs.contains("sensitive-fixture-123"));assert!(built.logs.contains("[REDACTED]"));let logs=built.logs;let stored=store.put(&f.cid,build,generation,&built.artifact).unwrap();


 let outbox_directory=tempfile::tempdir().unwrap();std::fs::set_permissions(outbox_directory.path(),std::fs::Permissions::from_mode(0o700)).unwrap();let outbox=webdock_build::worker::Outbox::open(outbox_directory.path().into()).unwrap();outbox.put("complete",json!({"buildID":build,"generation":generation,"status":"succeeded","logs":logs,"artifact":{"kind":"oci","digest":stored.digest(),"storageKey":stored.storage_key(),"sizeBytes":stored.size(),"imageDigest":stored.image_digest()}})).unwrap();assert!(outbox.flush(&control).await.is_err(),"lost HTTP acknowledgment after database commit");assert!(outbox.has_pending());drop(outbox);let recovered=webdock_build::worker::Outbox::open(outbox_directory.path().into()).unwrap();let completed=recovered.flush(&control).await.unwrap().unwrap();assert!(!recovered.has_pending());assert_eq!(completed["status"],"succeeded");assert_eq!(completed["release"]["status"],"queued");assert_eq!(service.complete_build(&worker,build,generation,Some(&stored),&logs,None).await.unwrap()["release"]["id"],completed["release"]["id"]);assert!(service.complete_build(&worker,build,generation,Some(&stored),"changed receipt",None).await.is_err());
 // The durable source policy survives session expiry, but not account revocation.
 sql(&f.owner,"UPDATE webdock_auth.session SET \"expiresAt\"=now()-interval '1 second' WHERE id=$1",vec![f.sid.clone().into()]).await;
 let release=service.claim_release(&worker).await.unwrap().unwrap();let rid=release["id"].as_str().unwrap();let rg=release["generation"].as_i64().unwrap() as i32;
 let prepared=service.prepare_publication(&worker,rid,rg).await.unwrap();let image=format!("{}@{}",prepared["repository"].as_str().unwrap(),prepared["imageDigest"].as_str().unwrap());
 assert!(service.publish_image(&worker,rid,rg,"untrusted.invalid/other@sha256:0000000000000000000000000000000000000000000000000000000000000000").await.is_err());
 let staged=service.publish_local_artifact(&worker,rid,rg,&store,&publisher).await.unwrap();assert_eq!(service.publish_image(&worker,rid,rg,&image).await.unwrap()["id"],staged["id"]);
 let claim=f.service.agent_request(&f.agent,"claim",json!({})).await.unwrap();assert_eq!(claim["id"],staged["id"]);f.service.agent_request(&f.agent,"guard",json!({"id":claim["id"],"generation":claim["generation"]})).await.unwrap();
 sql(&f.owner,"UPDATE webdock_auth.\"user\" SET banned=true WHERE id=$1",vec![f.uid.clone().into()]).await;assert!(f.service.agent_request(&f.agent,"guard",json!({"id":claim["id"],"generation":claim["generation"]})).await.is_err());sql(&f.owner,"UPDATE webdock_auth.\"user\" SET banned=false WHERE id=$1",vec![f.uid.clone().into()]).await;
 f.proof(&claim,"git-fixture-runtime").await;assert_eq!(service.observe_release(&worker,rid,rg).await.unwrap()["status"],"ready");

 assert_eq!(service.observe_release(&worker,rid,rg).await.unwrap()["status"],"ready");
 sql(&f.owner,"UPDATE webdock_auth.session SET \"expiresAt\"=now()+interval '1 hour' WHERE id=$1",vec![f.sid.clone().into()]).await;
 let sources=service.execute(&f.principal,json!({"action":"git.sources.list","projectID":f.pid})).await.unwrap();assert_eq!(sources["docs"][0]["buildEnvironmentNames"],json!(["BUILD_TOKEN"]));assert!(!sources.to_string().contains("sensitive-fixture-123"));
 let connections=service.execute(&f.principal,json!({"action":"git.connections.list","customerID":f.cid})).await.unwrap();assert_eq!(connections["docs"][0]["id"],connection);
 let repositories=service.execute(&f.principal,json!({"action":"git.repositories.list","customerID":f.cid,"connectionID":connection})).await.unwrap();assert_eq!(repositories["docs"][0]["fullName"],"fixture/local");
 let builds=service.execute(&f.principal,json!({"action":"git.builds.list","projectID":f.pid})).await.unwrap();assert_eq!(builds["docs"][0]["projectID"],f.pid);assert_eq!(builds["docs"][0]["targetID"],app);
 let retry=service.execute(&f.principal,json!({"action":"git.builds.request","projectID":f.pid,"targetID":app,"idempotencyKey":"cancel-build-request-1"})).await.unwrap();let retry_claim=service.claim_build(&worker).await.unwrap().unwrap();assert_eq!(retry_claim["buildID"],retry["id"]);service.execute(&f.principal,json!({"action":"git.builds.cancel","projectID":f.pid,"buildID":retry["id"]})).await.unwrap();assert!(service.guard_build(&worker,retry["id"].as_str().unwrap(),retry_claim["generation"].as_i64().unwrap() as i32).await.is_err());
 let releases=service.execute(&f.principal,json!({"action":"git.releases.list","projectID":f.pid})).await.unwrap();let rollback_command=json!({"action":"git.releases.rollback","projectID":f.pid,"releaseID":rid,"revision":releases["docs"][0]["revision"],"idempotencyKey":"rollback-git-request-1"});let rollback=service.execute_with_authority(&f.principal,&browser.authority,rollback_command.clone(),webdock_build::BuildCeiling{read:true,write:true}).await.unwrap();assert_eq!(service.execute_with_authority(&f.principal,&browser.authority,rollback_command,webdock_build::BuildCeiling{read:true,write:true}).await.unwrap()["id"],rollback["id"]);let rollback_claim=service.claim_release(&worker).await.unwrap().unwrap();assert_eq!(rollback_claim["id"],rollback["id"]);
 let rollback_id=rollback["id"].as_str().unwrap();let rollback_generation=rollback_claim["generation"].as_i64().unwrap() as i32;
 let prepared=service.prepare_publication(&worker,rollback_id,rollback_generation).await.unwrap();let rollback_image=format!("{}@{}",prepared["repository"].as_str().unwrap(),prepared["imageDigest"].as_str().unwrap());
 let operation=service.publish_image(&worker,rollback_id,rollback_generation,&rollback_image).await.unwrap();
 let persisted=f.owner.query_one_raw(Statement::from_sql_and_values(DbBackend::Postgres,"SELECT desired FROM webdock_auth.hosting_operation WHERE id=$1",[operation["id"].as_str().unwrap().into()])).await.unwrap().unwrap().try_get::<Value>("","desired").unwrap();assert_eq!(persisted["gitApprovalAuthority"],serde_json::to_value(&browser.authority).unwrap());
 let native=hosting.claim_runtime(&f.agent).await.unwrap().unwrap();assert_eq!(native.operation_id,operation["id"].as_str().unwrap());hosting.guard_runtime_command(&f.agent,&native).await.unwrap();
 browser.revoke(&f.owner).await;
 assert!(service.guard_release(&worker,rollback_id,rollback_generation).await.is_err());assert!(hosting.guard_runtime_command(&f.agent,&native).await.is_err());assert!(hosting.complete_runtime_failure(&f.agent,&native,"execution_failed").await.is_err());

 sql(&f.owner,"UPDATE webdock_auth.session SET \"expiresAt\"=now()-interval '1 second' WHERE id=$1",vec![f.sid.clone().into()]).await;assert!(service.guard_release(&worker,rollback["id"].as_str().unwrap(),rollback_claim["generation"].as_i64().unwrap() as i32).await.is_err());
 sql(&f.owner,"UPDATE webdock_auth.git_worker SET enabled=false WHERE id=$1",vec![worker_id.into()]).await;assert!(service.authenticate_worker(&credential).await.is_err());assert_eq!(control.post("claim",&json!({})).await.unwrap_err().code,"worker_revoked");assert!(service.complete_build(&worker,build,generation,Some(&stored),&logs,None).await.is_err());
 }).await;
    for table in [
        "git_check_outbox",
        "git_release",
        "git_artifact",
        "git_build",
        "git_source",
        "git_repository",
        "git_connection",
    ] {
        let predicate = match table {
            "git_check_outbox" => {
                "build_id IN (SELECT id FROM webdock_auth.git_build WHERE customer_id=$1)"
            }
            _ => "customer_id=$1",
        };
        sql(
            &fixture.owner,
            &format!("DELETE FROM webdock_auth.{table} WHERE {predicate}"),
            vec![fixture.cid.clone().into()],
        )
        .await;
    }
    sql(
        &fixture.owner,
        "DELETE FROM webdock_auth.git_worker WHERE id=$1",
        vec![cleanup_worker.into()],
    )
    .await;
    let _ = cleanup_connection;
    browser_fixture.cleanup(&fixture.owner).await;
    fixture.cleanup().await;
    outcome.unwrap();
}
