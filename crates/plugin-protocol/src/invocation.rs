use crate::{PluginError, Result};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InvocationClaims {
    #[serde(deserialize_with = "integer")]
    pub v: u8,
    pub id: String,
    #[serde(rename = "pluginID")]
    pub plugin_id: String,
    #[serde(deserialize_with = "integer")]
    pub generation: u64,
    pub action: String,
    #[serde(rename = "projectID")]
    pub project_id: String,
    #[serde(rename = "customerID")]
    pub customer_id: String,
    #[serde(deserialize_with = "integer")]
    pub iat: i64,
    #[serde(deserialize_with = "integer")]
    pub exp: i64,
}

/// Signature authenticates the issuer, never current grant/session authority.
/// The signed bytes are the base64url body, preserving the existing HTTP contract.
pub fn verify_invocation(
    token: &str,
    key: &VerifyingKey,
    plugin_id: &str,
    generation: u64,
    now: i64,
) -> Result<InvocationClaims> {
    let parse = || -> Option<InvocationClaims> {
        if token.len() > 16384 {
            return None;
        }
        let (body, signature) = token.split_once('.')?;
        let signature = Signature::from_slice(&URL_SAFE_NO_PAD.decode(signature).ok()?).ok()?;
        key.verify_strict(body.as_bytes(), &signature).ok()?;
        let claims: InvocationClaims =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(body).ok()?).ok()?;
        let slug = claims.plugin_id.as_bytes();
        if claims.v != 1
            || claims.plugin_id != plugin_id
            || slug.is_empty()
            || slug.len() > 64
            || !slug[0].is_ascii_lowercase()
            || !slug
                .iter()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'-')
            || claims.generation == 0
            || claims.generation > 9_007_199_254_740_991
            || claims.generation != generation
            || claims.action.is_empty()
            || claims.action.encode_utf16().count() > 64
            || claims.project_id.is_empty()
            || claims.project_id.len() > 20
            || !claims.project_id.bytes().all(|c| c.is_ascii_digit())
            || claims.customer_id.is_empty()
            || claims.customer_id.starts_with('0')
            || claims.customer_id.len() > 19
            || !claims.customer_id.bytes().all(|c| c.is_ascii_digit())
            || uuid::Uuid::parse_str(&claims.id)
                .ok()?
                .hyphenated()
                .to_string()
                != claims.id.to_ascii_lowercase()
            || claims.iat > now
            || claims.exp <= now
            || !(1..=60).contains(&claims.exp.checked_sub(claims.iat)?)
        {
            return None;
        }
        Some(claims)
    };
    parse().ok_or_else(PluginError::denied)
}

// JSON numbers have no distinct integer type in the original JavaScript contract.
fn integer<'de, D, T>(deserializer: D) -> std::result::Result<T, D::Error>
where
    D: serde::Deserializer<'de>,
    T: TryFrom<i64>,
{
    let number = serde_json::Number::deserialize(deserializer)?;
    let value = number
        .as_f64()
        .filter(|n| n.fract() == 0.0 && n.abs() <= 9_007_199_254_740_991.0)
        .ok_or_else(|| serde::de::Error::custom("Expected a safe integer"))?;
    T::try_from(value as i64).map_err(|_| serde::de::Error::custom("Integer outside range"))
}
