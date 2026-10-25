//! Mail runtime over private Unix sockets or pinned mTLS, with its own metadata database.
use serde::Deserialize;
use std::{path::PathBuf, process::ExitCode, sync::Arc};
use webdock_plugin_kit::transport::{CoreTls, ListenTls, RuntimeTransport};
use webdock_plugin_runtime::{self as runtime};
type Error = Box<dyn std::error::Error + Send + Sync>;

mod startup;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Configuration {
    manifest: PathBuf,
    issuer_public_key_hex: String,
    generation: u64,
    listen: Option<PathBuf>,
    core: Option<PathBuf>,
    listen_tls: Option<ListenTls>,
    core_tls: Option<CoreTls>,
    core_peers: Vec<runtime::CorePeer>,
    storage_url: String,
    storage_ca: Option<PathBuf>,
    secret_key_hex: String,
    platform_transport: webdock_mail::transport::Platform,
    #[serde(default)]
    trust_unverified_domains: bool,
    mailboxes: Option<webdock_mail::engine::EngineConfig>,
    delivery: Option<webdock_mail::executor::DeliveryConfiguration>,
}
fn certificate_leaf(path: &std::path::Path) -> Result<Vec<u8>, Error> {
    rustls_pemfile::certs(&mut std::io::Cursor::new(webdock_plugin_kit::read_file(
        path, false,
    )?))
    .next()
    .transpose()?
    .map(|c| c.as_ref().to_vec())
    .ok_or_else(|| "runtime certificate required".into())
}
async fn run() -> Result<(), Error> {
    let mut args = std::env::args_os().skip(1);
    let path = PathBuf::from(args.next().ok_or("configuration path required")?);
    if args.next().is_some() {
        return Err("unexpected argument".into());
    }
    let config: Configuration =
        serde_json::from_slice(&webdock_plugin_kit::read_file(&path, true)?)?;
    let transport = RuntimeTransport {
        listen: config.listen,
        core: config.core,
        listen_tls: config.listen_tls,
        core_tls: config.core_tls,
    };
    transport.validate()?;
    let manifest_bytes = webdock_plugin_kit::read_file(&config.manifest, false)?;
    let manifest = webdock_plugin_protocol::Manifest::parse(&manifest_bytes)?;
    webdock_mail::validate_manifest(&manifest)?;
    config.platform_transport.validate()?;
    if config.trust_unverified_domains
        && !matches!(
            config.platform_transport,
            webdock_mail::transport::Platform::Smtp { .. }
        )
    {
        return Err("unverified domains are trusted only with a loopback catcher".into());
    }
    let store = match config.storage_ca {
        Some(path) => {
            webdock_mail::store::Store::connect_tls(
                &config.storage_url,
                &webdock_plugin_kit::read_file(&path, false)?,
            )
            .await?
        }
        None => webdock_mail::store::Store::connect(&config.storage_url).await?,
    };
    let client = transport.core_client_lazy().await?;
    let engines = match config.mailboxes {
        Some(mailboxes) => Some(webdock_mail::engine::Engines::new(
            Box::new(webdock_mail::engine::HostWorkloads {
                client: client.clone(),
                plugin: manifest.id().into(),
                generation: config.generation,
            }),
            mailboxes,
        )?),
        None => None,
    };
    let plugin = webdock_mail::Plugin::new(
        store,
        webdock_mail::seal::Sealer::new(&config.secret_key_hex)?,
        webdock_mail::transport::Sender::new(webdock_mail::transport::TURBOSMTP_ORIGIN),
        Box::new(webdock_mail::SystemDns::new()?),
        webdock_mail::Settings {
            platform: config.platform_transport.clone(),
            trust_unverified_domains: config.trust_unverified_domains,
        },
        engines,
    );
    let key: [u8; 32] = hex::decode(config.issuer_public_key_hex)?
        .try_into()
        .map_err(|_| "invalid key")?;
    let authority = runtime::RemoteAuthority::new(
        client.clone(),
        manifest.id().into(),
        config.generation,
        config.core_peers.clone(),
    )?;
    let mut native_router = axum::Router::new();
    let mut dispatch = None;
    let plugin =
        if let Some(delivery) = config.delivery {
            if delivery.gateway_peers.len() > 16
                || delivery.gateway_peers.iter().any(|peer| match peer {
                    runtime::CorePeer::MutualTls { certificate_sha256 } => {
                        !webdock_mail_protocol::valid_digest(certificate_sha256)
                    }
                    runtime::CorePeer::Unix { .. } => false,
                })
            {
                return Err("invalid gateway peers".into());
            }
            for gateway in &delivery.gateway_peers {
                if config.core_peers.iter().any(|core| {
                    serde_json::to_value(core).ok() == serde_json::to_value(gateway).ok()
                }) {
                    return Err("gateway and Core peers must be distinct".into());
                }
            }
            let payloads: Arc<dyn webdock_mail_runtime::PrivatePayloadStore> = Arc::new(
                webdock_mail::payload::PgPrivatePayloadStore::new(
                    plugin.store(),
                    &config.secret_key_hex,
                )
                .await?,
            );
            let policy = webdock_mail::executor::Policy::new(
                plugin.store(),
                config.platform_transport.clone(),
                webdock_mail::seal::Sealer::new(&config.secret_key_hex)?,
                delivery.native_accounts,
            )?;
            let control: Arc<dyn webdock_mail_runtime::SendControl> =
                webdock_mail::executor::FencedControl::new(
                    Arc::new(
                        webdock_mail_protocol::native_control::NativeControlClient::new(
                            client.channel(),
                            config.generation,
                        )?,
                    ),
                    policy.clone(),
                );
            let listener_leaf = transport
                .listen_tls
                .as_ref()
                .map(|tls| certificate_leaf(&tls.certificate))
                .transpose()?;
            let callback_leaf = transport
                .core_tls
                .as_ref()
                .map(|tls| certificate_leaf(&tls.certificate))
                .transpose()?;
            let binding = webdock_mail::executor::resolve_provider_binding(
                delivery.provider_binding,
                config.generation,
                &manifest_bytes,
                listener_leaf.as_deref(),
                callback_leaf.as_deref(),
            )?;
            let executor = webdock_mail::executor::ManagedTransport::new(
                policy,
                client.channel(),
                binding,
                &delivery.native_lease_issuer_public_key_hex,
                webdock_mail::transport::Sender::new(webdock_mail::transport::TURBOSMTP_ORIGIN),
                config.generation,
            )?;
            native_router = webdock_mail::listener::native_routes(
                webdock_mail_runtime::send_api::SendApi::new(control.clone(), payloads.clone())
                    .router(),
                delivery.gateway_peers,
            );
            dispatch = Some(startup::Dispatcher {
                control: control.clone(),
                payloads: payloads.clone(),
                transport: executor,
            });
            plugin.with_delivery(webdock_mail::delivery::Delivery::new(control, payloads))?
        } else {
            plugin
        };
    let runtime = runtime::Runtime::new(
        manifest,
        config.generation,
        ed25519_dalek::VerifyingKey::from_bytes(&key)?,
        Arc::new(authority),
        Arc::new(webdock_mail::Handler(plugin.clone())),
    )?;
    let shutdown = async {
        #[cfg(unix)]
        {
            if let Ok(mut term) =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            {
                tokio::select! { _=tokio::signal::ctrl_c()=>{},_=term.recv()=>{} }
            } else {
                let _ = tokio::signal::ctrl_c().await;
            }
        }
        #[cfg(not(unix))]
        {
            let _ = tokio::signal::ctrl_c().await;
        }
    };
    let resume = || plugin.resume();
    match (&transport.listen, &transport.listen_tls) {
        (Some(path), None) => {
            let socket = runtime::UnixSocket::bind(path)?;
            startup::serve_delivery(
                |stopped| async {
                    Ok(
                        webdock_mail::listener::serve_unix(runtime, native_router, socket, async {
                            let _ = stopped.await;
                        })
                        .await?,
                    )
                },
                shutdown,
                client,
                webdock_mail::PLUGIN_ID,
                config.generation,
                resume,
                dispatch,
            )
            .await?;
        }
        (None, Some(tls)) => {
            let material = tls.material()?;
            let listener = tokio::net::TcpListener::bind(tls.address).await?;
            startup::serve_delivery(
                |stopped| async {
                    Ok(webdock_mail::listener::serve_mtls(
                        runtime,
                        native_router,
                        listener,
                        material,
                        async {
                            let _ = stopped.await;
                        },
                    )
                    .await?)
                },
                shutdown,
                client,
                webdock_mail::PLUGIN_ID,
                config.generation,
                resume,
                dispatch,
            )
            .await?;
        }
        _ => return Err("listener required".into()),
    }
    Ok(())
}
#[tokio::main]
async fn main() -> ExitCode {
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(_) => {
            eprintln!("mail_plugin_start_failed");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn configuration() -> serde_json::Value {
        serde_json::json!({
            "manifest":"/run/mail/manifest.json", "issuerPublicKeyHex":"a".repeat(64),
            "generation":2, "corePeers":[{"kind":"mutualTls","certificateSha256":"b".repeat(64)}],
            "storageUrl":"postgresql://metadata.invalid/mail", "secretKeyHex":"c".repeat(64),
            "platformTransport":{"kind":"smtp","host":"127.0.0.1","port":9}
        })
    }

    #[test]
    fn managed_tls_configuration_needs_no_unix_paths() {
        let mut value = configuration();
        value["listenTls"] = serde_json::json!({"address":"0.0.0.0:8443","certificate":"/run/mail/runtime.crt","privateKey":"/run/mail/runtime.key","authority":"/run/mail/core-ca.crt"});
        value["coreTls"] = serde_json::json!({"origin":"https://core.test:8443","domain":"core.test","certificate":"/run/mail/runtime.crt","privateKey":"/run/mail/runtime.key","authority":"/run/mail/core-ca.crt","serverCertificateSha256":"b".repeat(64)});
        value["storageCa"] = "/run/mail/storage-ca.crt".into();
        assert!(serde_json::from_value::<Configuration>(value).is_ok());
    }

    #[test]
    fn legacy_private_unix_configuration_still_parses() {
        let mut value = configuration();
        value["listen"] = "/run/mail/plugin.sock".into();
        value["core"] = "/run/mail/core.sock".into();
        value["storageUrl"] = "postgresql://localhost/mail".into();
        value["corePeers"] = serde_json::json!([{"kind":"unix","uid":1000}]);
        assert!(serde_json::from_value::<Configuration>(value).is_ok());
    }

    #[test]
    fn runtime_configuration_rejects_missing_ambiguous_and_untrusted_transports() {
        let mut unix = configuration();
        unix["listen"] = "/run/mail/plugin.sock".into();
        unix["core"] = "/run/mail/core.sock".into();
        let tls = serde_json::json!({"address":"0.0.0.0:8443","certificate":"/run/mail/runtime.crt","privateKey":"/run/mail/runtime.key","authority":"/run/mail/core-ca.crt"});
        let mut ambiguous = unix.clone();
        ambiguous["listenTls"] = tls;
        let mut relative = unix.clone();
        relative["core"] = "relative.sock".into();
        for value in [configuration(), ambiguous, relative] {
            let config = serde_json::from_value::<Configuration>(value).unwrap();
            assert!(
                RuntimeTransport {
                    listen: config.listen,
                    core: config.core,
                    listen_tls: config.listen_tls,
                    core_tls: config.core_tls
                }
                .validate()
                .is_err()
            );
        }
        unix["unknownPrivateField"] = true.into();
        assert!(serde_json::from_value::<Configuration>(unix).is_err());
        let mut strict_tls = configuration();
        strict_tls["listenTls"] = serde_json::json!({"address":"0.0.0.0:8443","certificate":"/run/mail/runtime.crt","privateKey":"/run/mail/runtime.key","authority":"/run/mail/core-ca.crt","insecure":true});
        assert!(serde_json::from_value::<Configuration>(strict_tls).is_err());
    }
}
