use crate::{Runtime, wire::plugin_runtime_client::PluginRuntimeClient};
use std::{
    future::Future,
    io,
    os::unix::fs::{FileTypeExt, MetadataExt, PermissionsExt},
    path::{Path, PathBuf},
    time::Duration,
};
use tokio::net::{TcpListener, UnixListener};
use tokio_stream::wrappers::{TcpListenerStream, UnixListenerStream};
use tonic::transport::{
    Certificate, Channel, ClientTlsConfig, Endpoint, Identity, Server, ServerTlsConfig,
};

fn private_directory(path: &Path) -> io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::other("Socket directory required"))?;
    let metadata = std::fs::symlink_metadata(parent)?;
    if !path.is_absolute()
        || !metadata.is_dir()
        || metadata.uid() != rustix::process::geteuid().as_raw()
        || metadata.mode() & 0o077 != 0
        || std::fs::canonicalize(parent)? != parent
    {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "Socket requires an owned private canonical directory",
        ));
    }
    Ok(())
}
/// Owns a socket inode; never removes or replaces an existing path.
pub struct UnixSocket {
    listener: Option<UnixListener>,
    path: PathBuf,
    inode: u64,
    device: u64,
}
impl UnixSocket {
    /// Borrow the inode owner for the entire server lifetime; it removes only its own socket.
    pub fn incoming(&mut self) -> io::Result<UnixListenerStream> {
        self.listener
            .take()
            .map(UnixListenerStream::new)
            .ok_or_else(|| io::Error::other("Socket listener already consumed"))
    }
    pub fn bind(path: impl AsRef<Path>) -> io::Result<Self> {
        let path = path.as_ref();
        private_directory(path)?;
        let listener = UnixListener::bind(path)?;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
        let metadata = std::fs::symlink_metadata(path)?;
        Ok(Self {
            listener: Some(listener),
            path: path.into(),
            inode: metadata.ino(),
            device: metadata.dev(),
        })
    }
}
impl Drop for UnixSocket {
    fn drop(&mut self) {
        if let Ok(metadata) = std::fs::symlink_metadata(&self.path)
            && metadata.file_type().is_socket()
            && metadata.ino() == self.inode
            && metadata.dev() == self.device
        {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}
/// Trust anchors and identity are mandatory; there is no insecure remote fallback.
pub struct MutualTls {
    pub identity: Identity,
    pub peer_ca: Certificate,
}
impl Runtime {
    pub async fn serve_unix(
        self,
        mut socket: UnixSocket,
        shutdown: impl Future<Output = ()> + Send + 'static,
    ) -> Result<(), tonic::transport::Error> {
        let incoming = socket.incoming().expect("socket listener owned");
        let result = Server::builder()
            .timeout(Duration::from_secs(55))
            .concurrency_limit_per_connection(32)
            .add_service(self.service())
            .serve_with_incoming_shutdown(incoming, shutdown)
            .await;
        drop(socket);
        result
    }
    pub async fn serve_mtls(
        self,
        listener: TcpListener,
        tls: MutualTls,
        shutdown: impl Future<Output = ()> + Send + 'static,
    ) -> Result<(), tonic::transport::Error> {
        Server::builder()
            .tls_config(
                ServerTlsConfig::new()
                    .identity(tls.identity)
                    .client_ca_root(tls.peer_ca)
                    .client_auth_optional(false)
                    .timeout(Duration::from_secs(5)),
            )?
            .timeout(Duration::from_secs(55))
            .concurrency_limit_per_connection(32)
            .add_service(self.service())
            .serve_with_incoming_shutdown(TcpListenerStream::new(listener), shutdown)
            .await
    }
}
pub async fn connect_unix(
    path: impl AsRef<Path>,
) -> Result<PluginRuntimeClient<Channel>, Box<dyn std::error::Error + Send + Sync>> {
    Ok(client(unix_channel(path).await?))
}
/// Validated owned private-socket channel for fixed-purpose plugin protocols.
pub async fn unix_channel(
    path: impl AsRef<Path>,
) -> Result<Channel, Box<dyn std::error::Error + Send + Sync>> {
    let path = path.as_ref();
    private_directory(path)?;
    let metadata = std::fs::symlink_metadata(path)?;
    if !metadata.file_type().is_socket()
        || metadata.uid() != rustix::process::geteuid().as_raw()
        || metadata.mode() & 0o077 != 0
    {
        return Err(io::Error::new(io::ErrorKind::PermissionDenied, "Untrusted socket").into());
    }
    let uri = format!(
        "unix://{}",
        path.to_str()
            .ok_or_else(|| io::Error::other("Invalid socket path"))?
    );
    let channel = Endpoint::from_shared(uri)?
        .timeout(Duration::from_secs(55))
        .connect_timeout(Duration::from_secs(3))
        .connect()
        .await?;
    Ok(channel)
}
pub async fn connect_mtls(
    origin: String,
    domain: String,
    tls: MutualTls,
) -> Result<PluginRuntimeClient<Channel>, Box<dyn std::error::Error + Send + Sync>> {
    Ok(client(mtls_channel(origin, domain, tls).await?))
}
pub(crate) async fn mtls_channel(
    origin: String,
    domain: String,
    tls: MutualTls,
) -> Result<Channel, Box<dyn std::error::Error + Send + Sync>> {
    if !origin.starts_with("https://") {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Remote plugins require HTTPS mTLS",
        )
        .into());
    }
    let channel = Endpoint::from_shared(origin)?
        .tls_config(
            ClientTlsConfig::new()
                .identity(tls.identity)
                .ca_certificate(tls.peer_ca)
                .domain_name(domain),
        )?
        .timeout(Duration::from_secs(55))
        .connect_timeout(Duration::from_secs(5))
        .connect()
        .await?;
    Ok(channel)
}
fn client(channel: Channel) -> PluginRuntimeClient<Channel> {
    PluginRuntimeClient::new(channel)
        .max_decoding_message_size(webdock_plugin_protocol::MANIFEST_BYTES + 1024)
        .max_encoding_message_size(128 * 1024)
}
