//! Delivery: the platform transport from the private configuration, or a project's own turboSMTP account.
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use serde::Deserialize;
use serde_json::{Value, json};
use std::time::Duration;

/// EU region for every provider call.
pub const TURBOSMTP_ORIGIN: &str = "https://api.eu.turbo-smtp.com";

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Platform {
    /// Plain SMTP to a loopback catcher (local dev); nothing leaves the machine.
    #[serde(rename_all = "camelCase")]
    Smtp { host: String, port: u16 },
    /// The operator's own turboSMTP account.
    #[serde(rename = "turbosmtp", rename_all = "camelCase")]
    TurboSmtp {
        consumer_key: String,
        consumer_secret: String,
    },
}
impl Platform {
    pub fn validate(&self) -> Result<(), &'static str> {
        match self {
            Self::Smtp { host, .. }
                if !["127.0.0.1", "::1", "localhost"].contains(&host.as_str()) =>
            {
                Err("plain SMTP transport is for a loopback catcher only")
            }
            _ => Ok(()),
        }
    }
}
pub enum Route<'a> {
    Platform(&'a Platform),
    Own { key: String, secret: String },
}
#[derive(Debug)]
pub enum Failure {
    /// The provider refused the credentials.
    Credentials,
    /// The provider refused this message.
    Rejected,
    Unavailable,
}
pub struct Delivery {
    pub transport: &'static str,
    pub provider_id: Option<String>,
}

pub struct Sender {
    http: reqwest::Client,
    origin: String,
}
impl Sender {
    pub fn new(origin: &str) -> Self {
        Self {
            http: reqwest::Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(15))
                .build()
                .expect("static HTTP client configuration"),
            origin: origin.into(),
        }
    }
    pub async fn send(&self, route: Route<'_>, message: Message) -> Result<Delivery, Failure> {
        match route {
            Route::Platform(Platform::Smtp { host, port }) => {
                AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(host)
                    .port(*port)
                    .timeout(Some(Duration::from_secs(15)))
                    .build()
                    .send(message)
                    .await
                    .map_err(|_| Failure::Unavailable)?;
                Ok(Delivery {
                    transport: "platform",
                    provider_id: None,
                })
            }
            Route::Platform(Platform::TurboSmtp {
                consumer_key,
                consumer_secret,
            }) => Ok(Delivery {
                transport: "platform",
                provider_id: Some(self.turbo(consumer_key, consumer_secret, &message).await?),
            }),
            Route::Own { key, secret } => Ok(Delivery {
                transport: "turbosmtp",
                provider_id: Some(self.turbo(&key, &secret, &message).await?),
            }),
        }
    }
    async fn turbo(&self, key: &str, secret: &str, message: &Message) -> Result<String, Failure> {
        let envelope = message.envelope();
        let to = envelope
            .to()
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>()
            .join(",");
        let from = envelope
            .from()
            .map(ToString::to_string)
            .ok_or(Failure::Rejected)?;
        let raw = String::from_utf8(message.formatted()).map_err(|_| Failure::Rejected)?;
        let response = self
            .http
            .post(format!("{}/api/v2/mail/send", self.origin))
            .header("consumerKey", key)
            .header("consumerSecret", secret)
            .json(&json!({"from": from, "to": to, "mime_raw": raw}))
            .send()
            .await
            .map_err(|_| Failure::Unavailable)?;
        match response.status().as_u16() {
            200..=299 => {}
            401 | 403 => return Err(Failure::Credentials),
            400 | 413 | 422 => return Err(Failure::Rejected),
            _ => return Err(Failure::Unavailable),
        }
        let body: Value = response.json().await.map_err(|_| Failure::Unavailable)?;
        match &body["mid"] {
            Value::String(id) => Ok(id.clone()),
            Value::Number(id) => Ok(id.to_string()),
            _ => Err(Failure::Unavailable),
        }
    }
}
