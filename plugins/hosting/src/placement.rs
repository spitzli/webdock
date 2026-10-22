//! Local-dev placement: one container per app, its port published on loopback.
// ponytail: Docker on the plugin host is for local dev only; production placement goes through
// `plugin.workloads` and the cluster agent, which replaces this module.
use bollard::{Docker, models::*, query_parameters::*};
use futures_util::{StreamExt, TryStreamExt};
use serde::Deserialize;
use std::{collections::HashMap, path::PathBuf, time::Duration};
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlacementConfig {
    pub docker_socket: PathBuf,
    /// Loopback address app ports are published on.
    pub bind_host: String,
}
pub type Error = Box<dyn std::error::Error + Send + Sync>;
pub struct Placement {
    docker: Docker,
    bind_host: String,
}
pub struct Spec<'a> {
    pub image: &'a str,
    pub port: u16,
    pub memory_mb: u32,
    pub env: &'a [(String, String)],
    pub running: bool,
}
pub struct Observed {
    pub running: bool,
    pub host_port: Option<u16>,
    pub restarts: i64,
}
fn name(id: &Uuid) -> String {
    format!("webdock-app-{id}")
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
impl Placement {
    pub fn new(config: &PlacementConfig) -> Result<Self, Error> {
        if !["127.0.0.1", "::1"].contains(&config.bind_host.as_str()) {
            return Err("apps publish on loopback only in local dev".into());
        }
        let socket = config
            .docker_socket
            .to_str()
            .ok_or("invalid Docker socket")?;
        Ok(Self {
            docker: Docker::connect_with_unix(socket, 120, bollard::API_DEFAULT_VERSION)?,
            bind_host: config.bind_host.clone(),
        })
    }
    pub fn host(&self) -> &str {
        &self.bind_host
    }
    /// Replaces the container with one for this specification. Pulls the image when missing.
    pub async fn deploy(&self, id: &Uuid, spec: &Spec<'_>) -> Result<(), Error> {
        if self.docker.inspect_image(spec.image).await.is_err() {
            self.docker
                .create_image(
                    Some(
                        CreateImageOptionsBuilder::default()
                            .from_image(spec.image)
                            .build(),
                    ),
                    None,
                    None,
                )
                .try_collect::<Vec<_>>()
                .await?;
        }
        self.remove(id).await?;
        let exposed = format!("{}/tcp", spec.port);
        let memory = i64::from(spec.memory_mb) * 1_048_576;
        let body = ContainerCreateBody {
            image: Some(spec.image.into()),
            env: Some(spec.env.iter().map(|(k, v)| format!("{k}={v}")).collect()),
            labels: Some(HashMap::from([
                ("webdock.plugin".into(), "hosting".into()),
                ("webdock.resource".into(), id.to_string()),
            ])),
            exposed_ports: Some(vec![exposed.clone()]),
            host_config: Some(HostConfig {
                port_bindings: Some(HashMap::from([(
                    exposed,
                    Some(vec![PortBinding {
                        host_ip: Some(self.bind_host.clone()),
                        host_port: Some(String::new()),
                    }]),
                )])),
                memory: Some(memory),
                memory_swap: Some(memory),
                pids_limit: Some(512),
                cap_drop: Some(vec!["NET_RAW".into()]),
                security_opt: Some(vec!["no-new-privileges:true".into()]),
                restart_policy: Some(RestartPolicy {
                    name: Some(RestartPolicyNameEnum::UNLESS_STOPPED),
                    ..Default::default()
                }),
                log_config: Some(HostConfigLogConfig {
                    typ: Some("json-file".into()),
                    config: Some(HashMap::from([
                        ("max-size".into(), "5m".into()),
                        ("max-file".into(), "2".into()),
                    ])),
                }),
                ..Default::default()
            }),
            ..Default::default()
        };
        self.docker
            .create_container(
                Some(
                    CreateContainerOptionsBuilder::default()
                        .name(&name(id))
                        .build(),
                ),
                body,
            )
            .await?;
        if spec.running {
            self.docker
                .start_container(&name(id), None::<StartContainerOptions>)
                .await?;
        }
        Ok(())
    }
    pub async fn observe(&self, id: &Uuid) -> Result<Option<Observed>, Error> {
        let container = match self
            .docker
            .inspect_container(&name(id), None::<InspectContainerOptions>)
            .await
        {
            Ok(container) => container,
            Err(error) if absent(&error) => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        let host_port = container
            .network_settings
            .and_then(|n| n.ports)
            .and_then(|ports| {
                ports
                    .into_values()
                    .flatten()
                    .flatten()
                    .find_map(|b| b.host_port)
            })
            .and_then(|p| p.parse().ok());
        Ok(Some(Observed {
            running: container.state.as_ref().and_then(|s| s.running) == Some(true),
            host_port,
            restarts: container.restart_count.unwrap_or_default(),
        }))
    }
    pub async fn power(&self, id: &Uuid, action: &str) -> Result<(), Error> {
        let name = name(id);
        let result = match action {
            "start" => {
                self.docker
                    .start_container(&name, None::<StartContainerOptions>)
                    .await
            }
            "stop" => {
                self.docker
                    .stop_container(
                        &name,
                        Some(StopContainerOptionsBuilder::default().t(10).build()),
                    )
                    .await
            }
            _ => {
                self.docker
                    .restart_container(
                        &name,
                        Some(RestartContainerOptionsBuilder::default().t(10).build()),
                    )
                    .await
            }
        };
        match result {
            // Already in the requested state.
            Ok(())
            | Err(bollard::errors::Error::DockerResponseServerError {
                status_code: 304, ..
            }) => Ok(()),
            Err(error) => Err(error.into()),
        }
    }
    /// The last lines of stdout and stderr, without control characters.
    pub async fn logs(&self, id: &Uuid, lines: usize) -> Result<Vec<String>, Error> {
        let mut stream = self.docker.logs(
            &name(id),
            Some(
                LogsOptionsBuilder::default()
                    .stdout(true)
                    .stderr(true)
                    .timestamps(true)
                    .tail(&lines.to_string())
                    .build(),
            ),
        );
        let mut out = Vec::new();
        let read = async {
            while let Some(chunk) = stream.next().await {
                let text = chunk?.to_string();
                out.extend(text.lines().map(|line| {
                    line.chars()
                        .filter(|c| !c.is_control() || *c == '\t')
                        .collect::<String>()
                }));
            }
            Ok::<(), bollard::errors::Error>(())
        };
        match tokio::time::timeout(Duration::from_secs(5), read).await {
            Ok(Err(error)) if absent(&error) => Ok(Vec::new()),
            Ok(result) => {
                result?;
                Ok(out.split_off(out.len().saturating_sub(lines)))
            }
            Err(_) => Ok(out),
        }
    }
    pub async fn remove(&self, id: &Uuid) -> Result<(), Error> {
        match self
            .docker
            .remove_container(
                &name(id),
                Some(RemoveContainerOptionsBuilder::default().force(true).build()),
            )
            .await
        {
            Ok(()) => Ok(()),
            Err(error) if absent(&error) => Ok(()),
            Err(error) => Err(error.into()),
        }
    }
}
