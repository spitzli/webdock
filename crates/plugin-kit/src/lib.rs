//! Building blocks of standalone product plugins. No Core authority or domain code lives here.
pub mod seal;

use std::{
    io::Read,
    os::unix::fs::{MetadataExt, OpenOptionsExt},
    path::Path,
};
use tokio_postgres::{Client, NoTls};
pub type Error = Box<dyn std::error::Error + Send + Sync>;

/// Reads an owned, single-link regular file; `private` additionally forbids group/other access.
pub fn read_file(path: &Path, private: bool) -> Result<Vec<u8>, Error> {
    if !path.is_absolute() {
        return Err("absolute path required".into());
    }
    let file = std::fs::OpenOptions::new()
        .read(true)
        .custom_flags(rustix::fs::OFlags::NOFOLLOW.bits() as i32)
        .open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_file()
        || metadata.nlink() != 1
        || metadata.uid() != rustix::process::geteuid().as_raw()
        || metadata.mode() & if private { 0o077 } else { 0o022 } != 0
        || metadata.len() > 262144
    {
        return Err("untrusted configuration file".into());
    }
    let mut bytes = Vec::new();
    file.take(262145).read_to_end(&mut bytes)?;
    Ok(bytes)
}
/// Without TLS a plugin only talks to databases on this machine.
pub fn loopback(url: &str) -> Result<(), Error> {
    let parsed = url::Url::parse(url)?;
    if !matches!(parsed.host_str(), Some("127.0.0.1" | "localhost" | "[::1]")) {
        return Err("database URLs must be loopback until TLS is configured".into());
    }
    Ok(())
}
/// Connects to the plugin's own database and applies pending migrations under an advisory lock.
// ponytail: one connection per process; a lost connection fails calls until the supervisor restarts it.
pub async fn storage(
    url: &str,
    plugin: &str,
    migrations: &[&str],
) -> Result<Client, tokio_postgres::Error> {
    let (client, connection) = tokio_postgres::connect(url, NoTls).await?;
    let label = plugin.to_owned();
    tokio::spawn(async move {
        if let Err(error) = connection.await {
            eprintln!("{label}_plugin_storage_lost: {error}");
        }
    });
    let lock = format!("webdock-{plugin}-plugin");
    client
        .execute("SELECT pg_advisory_lock(hashtext($1))", &[&lock])
        .await?;
    client
        .batch_execute("CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY)")
        .await?;
    let applied: i32 = client
        .query_one(
            "SELECT COALESCE(max(version),0) FROM schema_migrations",
            &[],
        )
        .await?
        .get(0);
    for (index, sql) in migrations.iter().enumerate() {
        let version = i32::try_from(index).unwrap_or(i32::MAX) + 1;
        if version > applied {
            client
                .batch_execute(&format!(
                    "BEGIN; {sql}; INSERT INTO schema_migrations VALUES ({version}); COMMIT;"
                ))
                .await?;
        }
    }
    client
        .execute("SELECT pg_advisory_unlock(hashtext($1))", &[&lock])
        .await?;
    Ok(client)
}
