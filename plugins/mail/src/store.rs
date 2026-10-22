//! The plugin's own database: sending domains, connected relay accounts and a short send log.
use tokio_postgres::Client;
use uuid::Uuid;

const MIGRATIONS: &[&str] = &["CREATE TABLE domains (
        id uuid PRIMARY KEY,
        project_id text NOT NULL,
        domain text NOT NULL UNIQUE,
        token text NOT NULL,
        verified_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE relays (
        id uuid PRIMARY KEY,
        project_id text NOT NULL UNIQUE,
        key_sealed bytea NOT NULL,
        secret_sealed bytea NOT NULL,
        key_hint text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE sends (
        id uuid PRIMARY KEY,
        domain_id uuid NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
        sender text NOT NULL,
        recipients text NOT NULL,
        subject text NOT NULL,
        transport text NOT NULL,
        status text NOT NULL CHECK (status IN ('accepted','failed')),
        provider_id text,
        created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX sends_domain ON sends(domain_id, created_at DESC);"];

pub type Error = tokio_postgres::Error;
#[derive(Clone, Debug)]
pub struct Domain {
    pub id: Uuid,
    pub domain: String,
    pub token: String,
    pub verified: bool,
}
pub struct Relay {
    pub id: Uuid,
    pub key_sealed: Vec<u8>,
    pub secret_sealed: Vec<u8>,
    pub key_hint: String,
    pub created_at: String,
}
pub struct Send {
    pub sender: String,
    pub recipients: String,
    pub subject: String,
    pub transport: String,
    pub status: String,
    pub created_at: String,
}

pub struct Store(Client);
impl Store {
    pub async fn connect(url: &str) -> Result<Self, Error> {
        Ok(Self(
            webdock_plugin_kit::storage(url, "mail", MIGRATIONS).await?,
        ))
    }
    /// False when the domain is already claimed, by this or any other project.
    pub async fn add_domain(&self, project: &str, domain: &Domain) -> Result<bool, Error> {
        Ok(self.0.execute("INSERT INTO domains(id,project_id,domain,token) VALUES($1,$2,$3,$4) ON CONFLICT (domain) DO NOTHING", &[&domain.id, &project, &domain.domain, &domain.token]).await? == 1)
    }
    pub async fn domain(&self, project: &str, id: &Uuid) -> Result<Option<Domain>, Error> {
        Ok(self
            .0
            .query_opt(
                "SELECT id,domain,token,verified_at IS NOT NULL FROM domains WHERE id=$1 AND project_id=$2",
                &[id, &project],
            )
            .await?
            .map(|r| Domain {
                id: r.get(0),
                domain: r.get(1),
                token: r.get(2),
                verified: r.get(3),
            }))
    }
    pub async fn verified(&self, id: &Uuid) -> Result<(), Error> {
        self.0
            .execute(
                "UPDATE domains SET verified_at=COALESCE(verified_at,now()) WHERE id=$1",
                &[id],
            )
            .await?;
        Ok(())
    }
    pub async fn delete_domain(&self, project: &str, id: &Uuid) -> Result<(), Error> {
        self.0
            .execute(
                "DELETE FROM domains WHERE id=$1 AND project_id=$2",
                &[id, &project],
            )
            .await?;
        Ok(())
    }
    /// False when the project already has a connected account.
    pub async fn add_relay(
        &self,
        project: &str,
        id: &Uuid,
        key: &[u8],
        secret: &[u8],
        hint: &str,
    ) -> Result<bool, Error> {
        Ok(self.0.execute("INSERT INTO relays(id,project_id,key_sealed,secret_sealed,key_hint) VALUES($1,$2,$3,$4,$5) ON CONFLICT (project_id) DO NOTHING", &[id, &project, &key, &secret, &hint]).await? == 1)
    }
    pub async fn relay(&self, project: &str) -> Result<Option<Relay>, Error> {
        Ok(self.0.query_opt("SELECT id,key_sealed,secret_sealed,key_hint,created_at::text FROM relays WHERE project_id=$1", &[&project]).await?.map(|r| Relay {
            id: r.get(0),
            key_sealed: r.get(1),
            secret_sealed: r.get(2),
            key_hint: r.get(3),
            created_at: r.get(4),
        }))
    }
    pub async fn delete_relay(&self, project: &str, id: &Uuid) -> Result<(), Error> {
        self.0
            .execute(
                "DELETE FROM relays WHERE id=$1 AND project_id=$2",
                &[id, &project],
            )
            .await?;
        Ok(())
    }
    #[expect(
        clippy::too_many_arguments,
        reason = "One row of the send log, column by column."
    )]
    pub async fn log(
        &self,
        domain: &Uuid,
        sender: &str,
        recipients: &str,
        subject: &str,
        transport: &str,
        status: &str,
        provider_id: Option<&str>,
    ) -> Result<(), Error> {
        self.0.execute("INSERT INTO sends(id,domain_id,sender,recipients,subject,transport,status,provider_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", &[&Uuid::new_v4(), domain, &sender, &recipients, &subject, &transport, &status, &provider_id]).await?;
        Ok(())
    }
    pub async fn recent(&self, domain: &Uuid) -> Result<Vec<Send>, Error> {
        Ok(self.0.query("SELECT sender,recipients,subject,transport,status,created_at::text FROM sends WHERE domain_id=$1 ORDER BY created_at DESC LIMIT 20", &[domain]).await?.iter().map(|r| Send {
            sender: r.get(0),
            recipients: r.get(1),
            subject: r.get(2),
            transport: r.get(3),
            status: r.get(4),
            created_at: r.get(5),
        }).collect())
    }
}
