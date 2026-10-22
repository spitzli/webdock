//! The plugin's own database: sending domains, connected relay accounts and a short send log.
use tokio_postgres::Client;
use uuid::Uuid;

const MIGRATIONS: &[&str] = &[
    "CREATE TABLE domains (
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
    CREATE INDEX sends_domain ON sends(domain_id, created_at DESC);",
    "ALTER TABLE domains DROP CONSTRAINT domains_domain_key;
    CREATE UNIQUE INDEX domains_project_domain ON domains(project_id, domain);
    CREATE UNIQUE INDEX domains_verified ON domains(domain) WHERE verified_at IS NOT NULL;
    CREATE TABLE engines (
        project_id text PRIMARY KEY,
        id uuid NOT NULL,
        admin_sealed bytea NOT NULL,
        state text NOT NULL CHECK (state IN ('provisioning','ready','failed'))
    );
    CREATE TABLE mailboxes (
        id uuid PRIMARY KEY,
        project_id text NOT NULL,
        domain_id uuid NOT NULL REFERENCES domains(id),
        local_part text NOT NULL,
        display_name text NOT NULL,
        password_sealed bytea NOT NULL,
        account_id text,
        quota_mb integer NOT NULL,
        state text NOT NULL CHECK (state IN ('creating','ready','failed')),
        error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (domain_id, local_part)
    );",
];

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
        Ok(self.0.execute("INSERT INTO domains(id,project_id,domain,token) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", &[&domain.id, &project, &domain.domain, &domain.token]).await? == 1)
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
    /// False when another project already verified the same domain.
    pub async fn verified(&self, id: &Uuid) -> Result<bool, Error> {
        match self
            .0
            .execute(
                "UPDATE domains SET verified_at=COALESCE(verified_at,now()) WHERE id=$1",
                &[id],
            )
            .await
        {
            Ok(_) => Ok(true),
            Err(error)
                if error.code() == Some(&tokio_postgres::error::SqlState::UNIQUE_VIOLATION) =>
            {
                Ok(false)
            }
            Err(error) => Err(error),
        }
    }
    /// False while mailboxes still use the domain.
    pub async fn delete_domain(&self, project: &str, id: &Uuid) -> Result<bool, Error> {
        match self
            .0
            .execute(
                "DELETE FROM domains WHERE id=$1 AND project_id=$2",
                &[id, &project],
            )
            .await
        {
            Ok(_) => Ok(true),
            Err(error)
                if error.code()
                    == Some(&tokio_postgres::error::SqlState::FOREIGN_KEY_VIOLATION) =>
            {
                Ok(false)
            }
            Err(error) => Err(error),
        }
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

#[derive(Clone, Debug)]
pub struct Engine {
    pub id: Uuid,
    pub admin_sealed: Vec<u8>,
    pub state: String,
}
#[derive(Clone, Debug)]
pub struct Mailbox {
    pub id: Uuid,
    pub project_id: String,
    pub domain_id: Uuid,
    pub domain: String,
    pub local_part: String,
    pub display_name: String,
    pub password_sealed: Vec<u8>,
    pub account_id: Option<String>,
    pub quota_mb: i32,
    pub state: String,
    pub error: Option<String>,
    pub created_at: String,
}
const MAILBOX: &str = "SELECT m.id,m.project_id,m.domain_id,d.domain,m.local_part,m.display_name,m.password_sealed,m.account_id,m.quota_mb,m.state,m.error,m.created_at::text FROM mailboxes m JOIN domains d ON d.id=m.domain_id";
fn mailbox(r: &tokio_postgres::Row) -> Mailbox {
    Mailbox {
        id: r.get(0),
        project_id: r.get(1),
        domain_id: r.get(2),
        domain: r.get(3),
        local_part: r.get(4),
        display_name: r.get(5),
        password_sealed: r.get(6),
        account_id: r.get(7),
        quota_mb: r.get(8),
        state: r.get(9),
        error: r.get(10),
        created_at: r.get(11),
    }
}
impl Store {
    /// The project's engine row, created with this password the first time.
    pub async fn engine(
        &self,
        project: &str,
        id: &Uuid,
        admin_sealed: &[u8],
    ) -> Result<Engine, Error> {
        self.0.execute("INSERT INTO engines(project_id,id,admin_sealed,state) VALUES($1,$2,$3,'provisioning') ON CONFLICT (project_id) DO NOTHING", &[&project, id, &admin_sealed]).await?;
        let r = self
            .0
            .query_one(
                "SELECT id,admin_sealed,state FROM engines WHERE project_id=$1",
                &[&project],
            )
            .await?;
        Ok(Engine {
            id: r.get(0),
            admin_sealed: r.get(1),
            state: r.get(2),
        })
    }
    pub async fn find_engine(&self, project: &str) -> Result<Option<Engine>, Error> {
        Ok(self
            .0
            .query_opt(
                "SELECT id,admin_sealed,state FROM engines WHERE project_id=$1",
                &[&project],
            )
            .await?
            .map(|r| Engine {
                id: r.get(0),
                admin_sealed: r.get(1),
                state: r.get(2),
            }))
    }
    pub async fn engine_state(&self, project: &str, state: &str) -> Result<(), Error> {
        self.0
            .execute(
                "UPDATE engines SET state=$2 WHERE project_id=$1",
                &[&project, &state],
            )
            .await?;
        Ok(())
    }
    /// False when the address already exists.
    pub async fn add_mailbox(&self, m: &Mailbox) -> Result<bool, Error> {
        Ok(self.0.execute("INSERT INTO mailboxes(id,project_id,domain_id,local_part,display_name,password_sealed,quota_mb,state) VALUES($1,$2,$3,$4,$5,$6,$7,'creating') ON CONFLICT (domain_id,local_part) DO NOTHING",
            &[&m.id, &m.project_id, &m.domain_id, &m.local_part, &m.display_name, &m.password_sealed, &m.quota_mb]).await? == 1)
    }
    pub async fn mailbox(&self, project: &str, id: &Uuid) -> Result<Option<Mailbox>, Error> {
        Ok(self
            .0
            .query_opt(
                &format!("{MAILBOX} WHERE m.id=$1 AND m.project_id=$2"),
                &[id, &project],
            )
            .await?
            .as_ref()
            .map(mailbox))
    }
    pub async fn creating_mailboxes(&self) -> Result<Vec<Mailbox>, Error> {
        Ok(self
            .0
            .query(&format!("{MAILBOX} WHERE m.state='creating'"), &[])
            .await?
            .iter()
            .map(mailbox)
            .collect())
    }
    pub async fn domain_mailboxes(&self, domain: &Uuid) -> Result<Vec<String>, Error> {
        Ok(self
            .0
            .query(
                "SELECT local_part FROM mailboxes WHERE domain_id=$1 ORDER BY local_part",
                &[domain],
            )
            .await?
            .iter()
            .map(|r| r.get(0))
            .collect())
    }
    pub async fn mailbox_ready(&self, id: &Uuid, account: &str) -> Result<(), Error> {
        self.0
            .execute(
                "UPDATE mailboxes SET state='ready',account_id=$2,error=NULL WHERE id=$1",
                &[id, &account],
            )
            .await?;
        Ok(())
    }
    pub async fn mailbox_failed(&self, id: &Uuid, error: &str) -> Result<(), Error> {
        self.0
            .execute(
                "UPDATE mailboxes SET state='failed',error=$2 WHERE id=$1",
                &[id, &error],
            )
            .await?;
        Ok(())
    }
    pub async fn mailbox_password(&self, id: &Uuid, sealed: &[u8]) -> Result<(), Error> {
        self.0
            .execute(
                "UPDATE mailboxes SET password_sealed=$2 WHERE id=$1",
                &[id, &sealed],
            )
            .await?;
        Ok(())
    }
    pub async fn delete_mailbox(&self, id: &Uuid) -> Result<(), Error> {
        self.0
            .execute("DELETE FROM mailboxes WHERE id=$1", &[id])
            .await?;
        Ok(())
    }
}
