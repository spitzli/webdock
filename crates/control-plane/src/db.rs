use sea_orm::{ConnectOptions, Database, DatabaseConnection};

// These startup adapters preserve Loco's error contract; request paths use compact errors.
#[expect(
    clippy::result_large_err,
    reason = "The Loco framework requires its error type at this startup boundary."
)]
pub async fn require_runtime_role(db: &DatabaseConnection, expected: &str) -> loco_rs::Result<()> {
    webdock_persistence::connection::verify_runtime_role(db, expected)
        .await
        .map_err(|_| loco_rs::Error::Message("Restricted database role required".into()))
}

#[expect(
    clippy::result_large_err,
    reason = "The Loco framework requires its error type at this startup boundary."
)]
pub async fn connect_runtime(
    url: &str,
    expected: &str,
    production: bool,
) -> loco_rs::Result<DatabaseConnection> {
    let url = webdock_persistence::connection::ConnectionUrl::parse(url, production)
        .map_err(|_| loco_rs::Error::Message("Invalid PostgreSQL connection policy".into()))?;
    let mut options = ConnectOptions::new(url.as_str());
    options
        .max_connections(10)
        .min_connections(1)
        .sqlx_logging(false);
    let db = Database::connect(options)
        .await
        .map_err(|_| loco_rs::Error::Message("Runtime database connection failed".into()))?;
    require_runtime_role(&db, expected).await?;
    Ok(db)
}
