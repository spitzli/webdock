//! Native Mail domain and worker contracts. Provider implementations live outside Core.
pub mod account_delivery;
mod authority;
pub mod dispatch;
pub mod incoming;
mod incoming_send;
pub mod keys;
pub mod provider_transport;
pub mod queued_webmail;
pub mod sending;
pub use webmail::WebmailDependencies as MailDependencies;
pub mod budget;
pub mod gateway;
pub mod gateway_control;
pub mod jmap;
pub mod message;
pub mod outbox;
pub mod payload;
pub mod proof;
pub mod secrets;
pub mod send_api;
pub mod send_control;
pub mod smtp;
pub mod smtp_policy;
pub mod submissions;
pub mod webmail;
pub mod webmail_send_api;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("invalid Mail message or submission")]
    Invalid,
    #[error("Mail credentials cannot be opened; check key version and instance binding")]
    Secret,
    #[error("private Mail storage is unavailable")]
    Storage,
    #[error("Mail submission is unavailable")]
    Unavailable,
}
pub type Result<T> = std::result::Result<T, Error>;
impl From<webdock_mail_message::Error> for Error {
    fn from(_: webdock_mail_message::Error) -> Self {
        Self::Invalid
    }
}
