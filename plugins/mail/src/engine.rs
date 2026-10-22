//! Mailbox engines, local-dev placement: one Stalwart Community Edition server per project in its
//! own internal Docker network. The network has no route out, so nothing a mailbox sends can leave
//! this machine; the host still reaches the server for IMAP, SMTP submission and management.
// ponytail: Docker on the plugin host is for local dev only; production placement (Kubernetes,
// relay-only egress, public ingress) goes through `plugin.workloads` and replaces this module.
use bollard::{Docker, models::*, query_parameters::*};
use futures_util::TryStreamExt;
use serde::{Deserialize, de::DeserializeOwned};
use serde_json::{Value, json};
use std::{collections::HashMap, net::IpAddr, path::PathBuf, time::Duration};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EngineConfig {
    pub docker_socket: PathBuf,
    /// Stalwart CE, pinned by digest.
    pub image: String,
}
pub type Error = Box<dyn std::error::Error + Send + Sync>;
pub const IMAP_PORT: u16 = 1993;
pub const SUBMISSION_PORT: u16 = 2465;
const DATA: &str = "/var/lib/stalwart";

pub struct Engines {
    docker: Docker,
    image: String,
}
fn name(project: &str) -> String {
    format!("webdock-mail-{project}")
}
fn hostname(project: &str) -> String {
    format!("mail.p{project}.webdock.internal")
}
fn admin_user(project: &str) -> String {
    format!("webdock-admin@{}", hostname(project))
}
fn absent(error: &bollard::errors::Error) -> bool {
    matches!(
        error,
        bollard::errors::Error::DockerResponseServerError {
            status_code: 404,
            ..
        }
    )
}

/// Management calls over Stalwart's JMAP endpoint.
pub struct Client {
    http: reqwest::Client,
    origin: String,
    user: String,
    password: String,
}
impl Client {
    fn new(ip: IpAddr, user: &str, password: &str) -> Self {
        Self {
            http: reqwest::Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(10))
                .build()
                .expect("static HTTP client configuration"),
            origin: format!("http://{ip}:8080"),
            user: user.into(),
            password: password.into(),
        }
    }
    pub async fn call<T: DeserializeOwned>(&self, method: &str, args: Value) -> Result<T, Error> {
        let response: Value = self
            .http
            .post(format!("{}/jmap", self.origin))
            .basic_auth(&self.user, Some(&self.password))
            .json(&json!({"using":["urn:ietf:params:jmap:core","urn:stalwart:jmap"],"methodCalls":[[method,args,"w"]]}))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        let result = &response["methodResponses"][0];
        if result[0] != method {
            return Err(format!("{method} failed").into());
        }
        let value = &result[1];
        for key in ["notCreated", "notUpdated", "notDestroyed"] {
            if value[key].as_object().is_some_and(|v| !v.is_empty()) {
                return Err(format!("{method} rejected").into());
            }
        }
        Ok(serde_json::from_value(value.clone())?)
    }
}
#[derive(Deserialize)]
pub struct Rows<T> {
    pub list: Vec<T>,
}
#[derive(Deserialize)]
pub struct Named {
    pub id: String,
    pub name: String,
}
#[derive(Deserialize)]
pub struct Created {
    pub created: HashMap<String, Named0>,
}
#[derive(Deserialize)]
pub struct Named0 {
    pub id: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Dkim {
    pub domain_id: String,
    pub selector: String,
    pub public_key: String,
    pub stage: String,
}

impl Engines {
    pub fn new(config: &EngineConfig) -> Result<Self, Error> {
        if !config.image.contains("@sha256:") {
            return Err("the mail engine image must be pinned by digest".into());
        }
        let socket = config
            .docker_socket
            .to_str()
            .ok_or("invalid Docker socket")?;
        Ok(Self {
            docker: Docker::connect_with_unix(socket, 120, bollard::API_DEFAULT_VERSION)?,
            image: config.image.clone(),
        })
    }
    async fn address(&self, project: &str) -> Result<Option<(IpAddr, bool)>, Error> {
        let container = match self
            .docker
            .inspect_container(&name(project), None::<InspectContainerOptions>)
            .await
        {
            Ok(container) => container,
            Err(error) if absent(&error) => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        let ip = container
            .network_settings
            .and_then(|n| n.networks)
            .and_then(|n| n.get(&name(project)).and_then(|e| e.ip_address.clone()))
            .and_then(|ip| ip.parse().ok());
        let recovery = container
            .config
            .and_then(|c| c.env)
            .is_some_and(|env| env.iter().any(|v| v.starts_with("STALWART_RECOVERY")));
        Ok(ip.map(|ip| (ip, recovery)))
    }
    /// The engine's address for clients, if it runs.
    pub async fn ip(&self, project: &str) -> Result<Option<IpAddr>, Error> {
        Ok(self
            .address(project)
            .await?
            .filter(|(_, recovery)| !recovery)
            .map(|(ip, _)| ip))
    }
    pub async fn client(&self, project: &str, admin_password: &str) -> Result<Client, Error> {
        let ip = self
            .ip(project)
            .await?
            .ok_or("mail engine is not running")?;
        Ok(Client::new(ip, &admin_user(project), admin_password))
    }
    async fn run(&self, project: &str, recovery: Option<&str>) -> Result<(), Error> {
        let mut env = Vec::new();
        if let Some(password) = recovery {
            env.push("STALWART_RECOVERY_MODE=1".to_owned());
            env.push(format!("STALWART_RECOVERY_ADMIN=admin:{password}"));
        }
        let body = ContainerCreateBody {
            image: Some(self.image.clone()),
            cmd: Some(vec!["--config".into(), format!("{DATA}/config.json")]),
            env: Some(env),
            labels: Some(HashMap::from([
                ("webdock.plugin".into(), "mail".into()),
                ("webdock.project".into(), project.into()),
            ])),
            host_config: Some(HostConfig {
                network_mode: Some(name(project)),
                mounts: Some(vec![Mount {
                    target: Some(DATA.into()),
                    source: Some(format!("{}-data", name(project))),
                    typ: Some(MountType::VOLUME),
                    ..Default::default()
                }]),
                memory: Some(536_870_912),
                pids_limit: Some(256),
                cap_drop: Some(vec!["ALL".into()]),
                // The binary carries this file capability and refuses to exec without it.
                cap_add: Some(vec!["NET_BIND_SERVICE".into()]),
                security_opt: Some(vec!["no-new-privileges:true".into()]),
                restart_policy: Some(RestartPolicy {
                    name: Some(RestartPolicyNameEnum::UNLESS_STOPPED),
                    ..Default::default()
                }),
                ..Default::default()
            }),
            ..Default::default()
        };
        self.docker
            .create_container(
                Some(
                    CreateContainerOptionsBuilder::default()
                        .name(&name(project))
                        .build(),
                ),
                body,
            )
            .await?;
        self.docker
            .start_container(&name(project), None::<StartContainerOptions>)
            .await?;
        Ok(())
    }
    async fn wait(
        &self,
        project: &str,
        user: &str,
        password: &str,
        method: &str,
    ) -> Result<Client, Error> {
        for _ in 0..120 {
            if let Some((ip, _)) = self.address(project).await? {
                let client = Client::new(ip, user, password);
                if client
                    .call::<Value>(method, json!({"ids":null}))
                    .await
                    .is_ok()
                {
                    return Ok(client);
                }
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        Err("mail engine did not become ready".into())
    }
    /// Creates and configures the project's engine from scratch. A half-configured engine holds no
    /// mailboxes yet, so it is discarded and rebuilt rather than resumed.
    pub async fn provision(&self, project: &str, admin_password: &str) -> Result<(), Error> {
        if let Ok(client) = self.client(project, admin_password).await
            && client
                .call::<Value>("x:Domain/get", json!({"ids":null}))
                .await
                .is_ok()
        {
            return Ok(());
        }
        self.destroy(project).await?;
        if self.docker.inspect_image(&self.image).await.is_err() {
            self.docker
                .create_image(
                    Some(
                        CreateImageOptionsBuilder::default()
                            .from_image(&self.image)
                            .build(),
                    ),
                    None,
                    None,
                )
                .try_collect::<Vec<_>>()
                .await?;
        }
        self.docker
            .create_network(NetworkCreateRequest {
                name: name(project),
                internal: Some(true),
                driver: Some("bridge".into()),
                labels: Some(HashMap::from([("webdock.plugin".into(), "mail".into())])),
                ..Default::default()
            })
            .await?;
        let bootstrap = hex::encode(webdock_plugin_kit::seal::random::<16>());
        self.run(project, Some(&bootstrap)).await?;
        let admin = self
            .wait(project, "admin", &bootstrap, "x:Bootstrap/get")
            .await?;
        let host = hostname(project);
        let _: Value = admin.call("x:Bootstrap/set", json!({"update":{"singleton":{"serverHostname":host,"defaultDomain":host,"requestTlsCertificate":false,"generateDkimKeys":false,"dataStore":{"@type":"RocksDb","path":format!("{DATA}/store")},"tracer":{"@type":"Stdout","level":"warn"}}}})).await?;
        self.docker
            .restart_container(&name(project), None::<RestartContainerOptions>)
            .await?;
        let admin = self
            .wait(project, "admin", &bootstrap, "x:Domain/get")
            .await?;
        let accounts: Rows<Named> = admin
            .call(
                "x:Account/get",
                json!({"ids":null,"properties":["id","name"]}),
            )
            .await?;
        let [account] = accounts.list.as_slice() else {
            return Err("unexpected accounts in a new mail engine".into());
        };
        let _: Value = admin.call("x:Account/set", json!({"update":{(account.id.as_str()):{"name":"webdock-admin","credentials":{"0":{"@type":"Password","secret":admin_password}},"roles":{"@type":"Admin"}}}})).await?;
        let listeners = json!({
            "http": {"name":"http","bind":{"[::]:8080":true},"protocol":"http","useTls":false,"tlsImplicit":false},
            "submissions": {"name":"submissions","bind":{format!("[::]:{SUBMISSION_PORT}"):true},"protocol":"smtp","useTls":true,"tlsImplicit":true},
            "imaps": {"name":"imaps","bind":{format!("[::]:{IMAP_PORT}"):true},"protocol":"imap","useTls":true,"tlsImplicit":true},
        });
        let _: Value = admin
            .call("x:NetworkListener/set", json!({"create":listeners}))
            .await?;
        let rcgen::CertifiedKey { cert, signing_key } =
            rcgen::generate_simple_self_signed(vec![host.clone()])?;
        let created: Created = admin.call("x:Certificate/set", json!({"create":{"c":{"certificate":{"@type":"Text","value":cert.pem()},"privateKey":{"@type":"Text","secret":signing_key.serialize_pem()}}}})).await?;
        let certificate = &created
            .created
            .get("c")
            .ok_or("certificate not created")?
            .id;
        let _: Value = admin
            .call(
                "x:SystemSettings/set",
                json!({"update":{"singleton":{"defaultCertificateId":certificate}}}),
            )
            .await?;
        // Without the recovery variables the temporary administrator no longer exists.
        self.docker
            .remove_container(
                &name(project),
                Some(RemoveContainerOptionsBuilder::default().force(true).build()),
            )
            .await?;
        self.run(project, None).await?;
        self.wait(
            project,
            &admin_user(project),
            admin_password,
            "x:Domain/get",
        )
        .await?;
        Ok(())
    }
    pub async fn destroy(&self, project: &str) -> Result<(), Error> {
        let name = name(project);
        match self
            .docker
            .remove_container(
                &name,
                Some(RemoveContainerOptionsBuilder::default().force(true).build()),
            )
            .await
        {
            Ok(()) => {}
            Err(error) if absent(&error) => {}
            Err(error) => return Err(error.into()),
        }
        for result in [
            self.docker
                .remove_volume(&format!("{name}-data"), None::<RemoveVolumeOptions>)
                .await,
            self.docker.remove_network(&name).await,
        ] {
            match result {
                Ok(()) => {}
                Err(error) if absent(&error) => {}
                Err(error) => return Err(error.into()),
            }
        }
        Ok(())
    }
}

/// Mailbox administration inside one engine.
impl Client {
    pub async fn domain(&self, domain: &str) -> Result<String, Error> {
        let rows: Rows<Named> = self
            .call(
                "x:Domain/get",
                json!({"ids":null,"properties":["id","name"]}),
            )
            .await?;
        if let Some(found) = rows.list.iter().find(|d| d.name == domain) {
            return Ok(found.id.clone());
        }
        let created: Created = self.call("x:Domain/set", json!({"create":{"d":{"name":domain,"certificateManagement":{"@type":"Manual"},"dnsManagement":{"@type":"Manual"},"dkimManagement":{"@type":"Automatic","algorithms":{"Dkim1RsaSha256":true},"selectorTemplate":"webdock-{algorithm}-{date-%Y%m%d}"}}}})).await?;
        Ok(created
            .created
            .get("d")
            .ok_or("domain not created")?
            .id
            .clone())
    }
    pub async fn create_mailbox(
        &self,
        domain_id: &str,
        local: &str,
        password: &str,
        quota: u64,
    ) -> Result<String, Error> {
        let created: Created = self.call("x:Account/set", json!({"create":{"u":{"@type":"User","name":local,"domainId":domain_id,"roles":{"@type":"User"},"permissions":{"@type":"Inherit"},"quotas":{"maxDiskQuota":quota},"encryptionAtRest":{"@type":"Disabled"},"credentials":{"0":{"@type":"Password","secret":password}}}}})).await?;
        Ok(created
            .created
            .get("u")
            .ok_or("mailbox not created")?
            .id
            .clone())
    }
    pub async fn password(&self, account: &str, password: &str) -> Result<(), Error> {
        let _: Value = self.call("x:Account/set", json!({"update":{account:{"credentials":{"0":{"@type":"Password","secret":password}}}}})).await?;
        Ok(())
    }
    pub async fn delete_mailbox(&self, account: &str) -> Result<(), Error> {
        let _: Value = self
            .call("x:Account/set", json!({"destroy":[account]}))
            .await?;
        Ok(())
    }
    pub async fn dkim(&self, domain_id: &str) -> Result<Option<(String, String)>, Error> {
        let rows: Rows<Dkim> = self
            .call(
                "x:DkimSignature/get",
                json!({"ids":null,"properties":["domainId","selector","publicKey","stage"]}),
            )
            .await?;
        Ok(rows
            .list
            .into_iter()
            .find(|k| k.domain_id == domain_id && k.stage == "active")
            .map(|k| (k.selector, k.public_key.split_whitespace().collect())))
    }
}
