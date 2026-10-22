//! Dedicated instances, local-dev placement: one PostgreSQL container and volume per resource.
// ponytail: Docker on the plugin host is for local dev only; production placement goes through
// `plugin.workloads` and the cluster agent (CNPG), which replaces this module.
use bollard::{Docker, models::*, query_parameters::*};
use futures_util::TryStreamExt;
use serde::Deserialize;
use std::{collections::HashMap, path::PathBuf, time::Duration};
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DedicatedConfig {
    pub docker_socket: PathBuf,
    /// Loopback address the instance port is published on, and the host customers connect to.
    pub bind_host: String,
}
pub struct Placement {
    docker: Docker,
    bind_host: String,
}
pub type Error = Box<dyn std::error::Error + Send + Sync>;
pub fn image(version: &str) -> Option<&'static str> {
    // ponytail: tags, not digests; pin digests when this placement leaves local dev.
    match version {
        "18" => Some("docker.io/library/postgres:18-alpine"),
        "17" => Some("docker.io/library/postgres:17-alpine"),
        _ => None,
    }
}
fn name(id: &Uuid) -> String {
    format!("webdock-pg-{id}")
}
fn labels(id: &Uuid) -> HashMap<String, String> {
    HashMap::from([
        ("webdock.plugin".into(), "postgres".into()),
        ("webdock.resource".into(), id.to_string()),
    ])
}
impl Placement {
    pub fn new(config: &DedicatedConfig) -> Result<Self, Error> {
        let socket = config
            .docker_socket
            .to_str()
            .ok_or("invalid Docker socket")?;
        if !["127.0.0.1", "::1"].contains(&config.bind_host.as_str()) {
            return Err("dedicated instances publish on loopback only in local dev".into());
        }
        Ok(Self {
            docker: Docker::connect_with_unix(socket, 30, bollard::API_DEFAULT_VERSION)?,
            bind_host: config.bind_host.clone(),
        })
    }
    pub fn host(&self) -> &str {
        &self.bind_host
    }
    /// Idempotent: reuses an existing container and volume of this resource. Returns the published port.
    pub async fn ensure(
        &self,
        id: &Uuid,
        version: &str,
        database: &str,
        role: &str,
        password: &str,
    ) -> Result<u16, Error> {
        let image = image(version).ok_or("unsupported version")?;
        let name = name(id);
        if self
            .docker
            .inspect_container(&name, None::<InspectContainerOptions>)
            .await
            .is_err()
        {
            if self.docker.inspect_image(image).await.is_err() {
                self.docker
                    .create_image(
                        Some(
                            CreateImageOptionsBuilder::default()
                                .from_image(image)
                                .build(),
                        ),
                        None,
                        None,
                    )
                    .try_collect::<Vec<_>>()
                    .await?;
            }
            let body = ContainerCreateBody {
                image: Some(image.into()),
                env: Some(vec![
                    format!("POSTGRES_USER={role}"),
                    format!("POSTGRES_PASSWORD={password}"),
                    format!("POSTGRES_DB={database}"),
                ]),
                labels: Some(labels(id)),
                exposed_ports: Some(vec!["5432/tcp".into()]),
                host_config: Some(HostConfig {
                    port_bindings: Some(HashMap::from([(
                        "5432/tcp".into(),
                        Some(vec![PortBinding {
                            host_ip: Some(self.bind_host.clone()),
                            host_port: Some(String::new()),
                        }]),
                    )])),
                    mounts: Some(vec![Mount {
                        target: Some("/var/lib/postgresql".into()),
                        source: Some(format!("{name}-data")),
                        typ: Some(MountType::VOLUME),
                        ..Default::default()
                    }]),
                    memory: Some(536_870_912),
                    pids_limit: Some(256),
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
                    Some(CreateContainerOptionsBuilder::default().name(&name).build()),
                    body,
                )
                .await?;
        }
        self.docker
            .start_container(&name, None::<StartContainerOptions>)
            .await
            .or_else(|error| match error {
                // Already running.
                bollard::errors::Error::DockerResponseServerError {
                    status_code: 304, ..
                } => Ok(()),
                other => Err(other),
            })?;
        let port = self.port(&name).await?;
        self.wait(port, database, role, password).await?;
        Ok(port)
    }
    async fn port(&self, name: &str) -> Result<u16, Error> {
        for _ in 0..20 {
            let container = self
                .docker
                .inspect_container(name, None::<InspectContainerOptions>)
                .await?;
            let port = container
                .network_settings
                .and_then(|n| n.ports)
                .and_then(|p| p.get("5432/tcp").cloned().flatten())
                .and_then(|b| b.first().and_then(|b| b.host_port.clone()))
                .and_then(|p| p.parse().ok());
            if let Some(port) = port {
                return Ok(port);
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
        Err("instance port not published".into())
    }
    async fn wait(
        &self,
        port: u16,
        database: &str,
        role: &str,
        password: &str,
    ) -> Result<(), Error> {
        let url = self.url(port, database, role, password);
        for _ in 0..240 {
            if let Ok((client, connection)) =
                tokio_postgres::connect(&url, tokio_postgres::NoTls).await
            {
                tokio::spawn(connection);
                if client.simple_query("SELECT 1").await.is_ok() {
                    return Ok(());
                }
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        Err("instance did not become ready".into())
    }
    pub async fn can_login(&self, port: u16, database: &str, role: &str, password: &str) -> bool {
        match tokio_postgres::connect(
            &self.url(port, database, role, password),
            tokio_postgres::NoTls,
        )
        .await
        {
            Ok((client, connection)) => {
                tokio::spawn(connection);
                client.simple_query("SELECT 1").await.is_ok()
            }
            Err(_) => false,
        }
    }
    pub fn url(&self, port: u16, database: &str, role: &str, password: &str) -> String {
        format!(
            "postgresql://{role}:{password}@{}:{port}/{database}",
            self.bind_host
        )
    }
    /// The instance's own superuser is the customer role, so it changes its own password.
    pub async fn password(
        &self,
        port: u16,
        database: &str,
        role: &str,
        old: &str,
        new: &str,
    ) -> Result<(), Error> {
        assert!(
            new.bytes().all(|b| b.is_ascii_hexdigit()),
            "generated password"
        );
        let (client, connection) =
            tokio_postgres::connect(&self.url(port, database, role, old), tokio_postgres::NoTls)
                .await?;
        tokio::spawn(connection);
        client
            .batch_execute(&format!("ALTER ROLE CURRENT_USER PASSWORD '{new}'"))
            .await?;
        Ok(())
    }
    pub async fn remove(&self, id: &Uuid) -> Result<(), Error> {
        let name = name(id);
        match self
            .docker
            .remove_container(
                &name,
                Some(
                    RemoveContainerOptionsBuilder::default()
                        .force(true)
                        .v(true)
                        .build(),
                ),
            )
            .await
        {
            Ok(())
            | Err(bollard::errors::Error::DockerResponseServerError {
                status_code: 404, ..
            }) => {}
            Err(error) => return Err(error.into()),
        }
        match self
            .docker
            .remove_volume(&format!("{name}-data"), None::<RemoveVolumeOptions>)
            .await
        {
            Ok(())
            | Err(bollard::errors::Error::DockerResponseServerError {
                status_code: 404, ..
            }) => Ok(()),
            Err(error) => Err(error.into()),
        }
    }
}
