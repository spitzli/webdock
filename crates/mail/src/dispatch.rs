//! One dispatch attempt per committed handoff. A failed or lost receipt never re-enters transport.
use crate::{
    Error, Result,
    message::{
        DispatchMessage, MAX_MESSAGE, PreparedMessage, SendRequest, Sender, prepare_message,
    },
    outbox::{PayloadFormat, Receipt, SendLease},
    payload::PrivatePayloadStore,
    proof::{message_digest, valid_id},
    provider_transport::preparation,
    send_control::{ControlError, SendControl},
};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::sync::Arc;

/// The concrete runtime owns the authenticated SMTP/plugin channel. It must make only one
/// external attempt and classify any ambiguous acceptance as Unknown.
#[async_trait::async_trait]
pub trait DispatchTransport: Send + Sync {
    /// Check only operator-owned routing configuration, before Core commits the handoff.
    fn can_submit(&self, job: &SendLease) -> bool;
    async fn submit(
        &self,
        job: &SendLease,
        authorization: &Value,
        message: &DispatchMessage,
        prepared: &PreparedMessage,
    ) -> Receipt;
}
pub struct Dispatched {
    pub job: SendLease,
    /// None means the job stopped before handoff; no external transport was called.
    pub receipt: Option<Receipt>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    from: String,
    to: Vec<String>,
}
fn load(
    store: &PrivatePayloadStore,
    job: &SendLease,
) -> Result<(DispatchMessage, PreparedMessage, String)> {
    if !valid_id(&job.id)
        || !valid_id(&job.customer_id)
        || !(1..=MAX_MESSAGE as i32).contains(&job.payload_bytes)
    {
        return Err(Error::Invalid);
    }
    let payload = store.get(&job.customer_id, &job.payload_ref)?;
    if payload.len() != job.payload_bytes as usize
        || hex::encode(Sha256::digest(&payload)) != job.request_hash
    {
        return Err(Error::Invalid);
    }
    let envelope: Envelope =
        serde_json::from_value(job.envelope.clone()).map_err(|_| Error::Invalid)?;
    let message = match job.payload_format {
        PayloadFormat::Request => {
            let request = SendRequest::parse_stored(
                serde_json::from_slice(&payload).map_err(|_| Error::Invalid)?,
                chrono::Utc::now(),
            )?;
            let recipients = request
                .to
                .iter()
                .chain(&request.cc)
                .chain(&request.bcc)
                .cloned()
                .collect::<Vec<_>>();
            if request.from.email != envelope.from || recipients != envelope.to {
                return Err(Error::Invalid);
            }
            request.compile()?
        }
        PayloadFormat::Mime => {
            if job.route["kind"] != "stalwart" {
                return Err(Error::Invalid);
            }
            let name = job.source_context["senderName"]
                .as_str()
                .ok_or(Error::Invalid)?
                .to_owned();
            DispatchMessage {
                sender: Sender {
                    email: envelope.from.clone(),
                    name: Some(name),
                },
                to: envelope.to.clone(),
                cc: vec![],
                bcc: vec![],
                subject: String::new(),
                raw: payload,
            }
        }
    };
    let prepared = prepare_message(&message.raw, &message.sender, &envelope.to)?;
    if prepared.from != envelope.from || prepared.to != envelope.to {
        return Err(Error::Invalid);
    }
    let digest = message_digest(&prepared.raw)?;
    Ok((message, prepared, digest))
}
pub async fn dispatch_one(
    control: &dyn SendControl,
    store: Arc<PrivatePayloadStore>,
    transport: &dyn DispatchTransport,
) -> std::result::Result<Option<Dispatched>, ControlError> {
    let value = control.call(json!({"action":"send.claim"})).await?;
    if value.is_null() {
        return Ok(None);
    }
    let job: SendLease = serde_json::from_value(value).map_err(|_| ControlError::unavailable())?;
    let payload_store = store.clone();
    let lease = job.clone();
    let loaded = tokio::task::spawn_blocking(move || {
        let (message, prepared, digest) = load(&payload_store, &lease)?;
        let commitment = preparation(&message, &prepared)?;
        Ok::<_, Error>((message, prepared, digest, commitment))
    })
    .await;
    let Ok(Ok((message, prepared, digest, commitment))) = loaded else {
        let _ = control
            .call(json!({"action":"send.reviewPreparation","lease":job}))
            .await;
        return Err(ControlError::unavailable());
    };
    if !transport.can_submit(&job) {
        if control
            .call(json!({"action":"send.reviewPreparation","lease":job}))
            .await?
            != true
        {
            return Err(ControlError::unavailable());
        }
        return Ok(Some(Dispatched { job, receipt: None }));
    }
    // Core validates current source, configuration, route and budget and commits handoff before
    // returning this authorization. If its acknowledgement is lost, do not attempt transport.
    let authorization = control
        .call(json!({"action":"send.begin","lease":job,"digest":digest,"preparation":commitment}))
        .await?;
    if authorization.is_null() {
        return Ok(Some(Dispatched { job, receipt: None }));
    }
    let mut receipt = if !matches!(job.route["kind"].as_str(), Some("direct" | "stalwart"))
        || authorization["kind"] != job.route["kind"]
    {
        Receipt::Unknown {}
    } else {
        transport
            .submit(&job, &authorization, &message, &prepared)
            .await
    };
    if let Receipt::Accepted { provider_id } = &receipt
        && (provider_id.is_empty()
            || provider_id.len() > 255
            || !provider_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b)))
    {
        receipt = Receipt::Unknown {};
    }
    if control
        .call(json!({"action":"send.finish","lease":job,"result":receipt}))
        .await?
        != true
    {
        return Err(ControlError::unavailable());
    }
    // Accepted Webmail MIME remains until separately acknowledged Sent filing. Unknown always
    // retains its bytes and reservation; neither case permits another dispatch attempt.
    if !matches!(receipt, Receipt::Unknown {})
        && !(matches!(receipt, Receipt::Accepted { .. })
            && job.payload_format == PayloadFormat::Mime)
    {
        let reference = job.payload_ref.clone();
        tokio::task::spawn_blocking(move || store.remove(&reference))
            .await
            .map_err(|_| ControlError::unavailable())?
            .map_err(|_| ControlError::unavailable())?;
    }
    Ok(Some(Dispatched {
        job,
        receipt: Some(receipt),
    }))
}

/// Remove only Core-selected terminal payloads. Unknown receipts and unfinished Sent filing
/// never enter this list; a lost cleanup acknowledgement can safely repeat the removal.
pub async fn cleanup_payloads(
    control: &dyn SendControl,
    store: Arc<PrivatePayloadStore>,
) -> std::result::Result<usize, ControlError> {
    let items: Vec<crate::submissions::CleanupItem> =
        serde_json::from_value(control.call(json!({"action":"send.cleanup"})).await?)
            .map_err(|_| ControlError::unavailable())?;
    if items.len() > 50
        || items.iter().any(|item| {
            !valid_id(&item.id)
                || !valid_id(&item.customer_id)
                || !uuid::Uuid::parse_str(&item.reference).is_ok_and(|v| {
                    v.to_string() == item.reference
                        && v.get_version_num() == 4
                        && v.get_variant() == uuid::Variant::RFC4122
                })
        })
    {
        return Err(ControlError::unavailable());
    }
    if items.is_empty() {
        return Ok(0);
    }
    let count = items.len();
    let items = tokio::task::spawn_blocking(move || {
        for item in &items {
            store.remove(&item.reference)?;
        }
        Ok::<_, Error>(items)
    })
    .await
    .map_err(|_| ControlError::unavailable())?
    .map_err(|_| ControlError::unavailable())?;
    #[derive(Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Cleaned {
        ok: bool,
    }
    let result: Cleaned = serde_json::from_value(
        control
            .call(json!({"action":"send.cleanupDone","items":items}))
            .await?,
    )
    .map_err(|_| ControlError::unavailable())?;
    if !result.ok {
        return Err(ControlError::unavailable());
    }
    Ok(count)
}
