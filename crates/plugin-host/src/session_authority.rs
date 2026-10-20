use crate::db_error;
use sea_orm::{DatabaseConnection, DatabaseTransaction, TransactionTrait};
use std::sync::Arc;
use webdock_browser_session::{BrowserSessions, StoredAuthority, revalidate_stored_authority};
use webdock_identity::IdentityService;
use webdock_plugin_protocol::{PluginError, Result};
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "source", rename_all = "kebab-case", deny_unknown_fields)]
pub(crate) enum AuthorityReference {
    Browser {
        authority: StoredAuthority,
    },
    Mcp {
        authority: webdock_oauth::McpAuthority,
    },
}
pub(crate) struct SessionAuthority {
    auth: DatabaseConnection,
    identity: Arc<IdentityService>,
    browser: Option<Arc<BrowserSessions>>,
    pub mcp: Option<Arc<webdock_oauth::OAuthService>>,
}
impl SessionAuthority {
    pub async fn new(
        auth: DatabaseConnection,
        identity: Arc<IdentityService>,
        browser: Option<Arc<BrowserSessions>>,
    ) -> Result<Self> {
        webdock_persistence::connection::verify_runtime_role(&auth, "webdock_auth_bootstrap")
            .await
            .map_err(|_| PluginError::denied())?;
        Ok(Self {
            auth,
            identity,
            browser,
            mcp: None,
        })
    }
    pub async fn begin(
        &self,
        subject: &str,
        session: &str,
        authority: &AuthorityReference,
        write: bool,
    ) -> Result<DatabaseTransaction> {
        let tx = self.auth.begin().await.map_err(db_error)?;
        self.verify(&tx, subject, session, authority, write).await?;
        Ok(tx)
    }
    pub async fn verify(
        &self,
        tx: &DatabaseTransaction,
        subject: &str,
        session: &str,
        authority: &AuthorityReference,
        write: bool,
    ) -> Result<()> {
        self.principal(tx, subject, session, authority, write)
            .await?;
        Ok(())
    }
    pub async fn begin_operator(
        &self,
        subject: &str,
        session: &str,
        authority: &webdock_browser_session::StoredAuthority,
    ) -> Result<DatabaseTransaction> {
        let tx = self.auth.begin().await.map_err(db_error)?;
        let principal = self
            .principal(
                &tx,
                subject,
                session,
                &AuthorityReference::Browser {
                    authority: authority.clone(),
                },
                true,
            )
            .await?;
        if !principal.is_operator() {
            return Err(PluginError::denied());
        }
        Ok(tx)
    }
    async fn principal(
        &self,
        tx: &DatabaseTransaction,
        subject: &str,
        session: &str,
        authority: &AuthorityReference,
        write: bool,
    ) -> Result<webdock_identity::Principal> {
        let principal = match authority {
            AuthorityReference::Browser { authority } => {
                if write && authority.read_only() {
                    return Err(PluginError::denied());
                }
                revalidate_stored_authority(
                    &self.identity,
                    tx,
                    self.browser.as_deref(),
                    subject,
                    session,
                    authority,
                )
                .await
                .map_err(|_| PluginError::denied())?
            }
            AuthorityReference::Mcp { authority } => {
                if write && !authority.can_write() {
                    return Err(PluginError::denied());
                }
                self.mcp
                    .as_ref()
                    .ok_or_else(PluginError::denied)?
                    .revalidate_mcp_authority_in(tx, authority)
                    .await
                    .map_err(|_| PluginError::denied())?
            }
        };
        if principal.user_id != subject
            || principal.session_id != session
            || (write && principal.in_tenant_preview())
        {
            return Err(PluginError::denied());
        }
        Ok(principal)
    }
}
