use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD as B64};
use ed25519_dalek::{Signer, SigningKey};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
pub fn catalog() -> Value {
    let key = SigningKey::from_bytes(&[27; 32]);
    let mut manifest: Value =
        serde_json::from_str(include_str!("../../../../plugins/postgres/manifest.json")).unwrap();
    manifest["image"] = json!(format!(
        "registry.example.test/postgres@sha256:{}",
        "a".repeat(64)
    ));
    manifest["jobs"] = json!([]);
    let raw = manifest.to_string();
    let hash = format!("{:x}", Sha256::digest(raw.as_bytes()));
    let payload = json!({"v":1,"registry":"https://registry.example.test","plugin_slug":"postgres","release_version":"0.1.0","kid":"trusted","manifest_sha256":hash,"assets":[{"name":"postgres-universal.json","sha256":hash,"size":raw.len()}]});
    let body = format!(
        "{}.{}",
        B64.encode(r#"{"alg":"EdDSA","kid":"trusted"}"#),
        B64.encode(payload.to_string())
    );
    let jws = format!(
        "{body}.{}",
        B64.encode(key.sign(body.as_bytes()).to_bytes())
    );
    json!({"version":1,"platformID":"fixture","keys":[{"registryURL":"https://registry.example.test","kid":"trusted","key":{"kty":"OKP","crv":"Ed25519","x":B64.encode(key.verifying_key().as_bytes())}}],"targets":[{"id":"local-eu","label":"EU fixture","clusterID":"42","policy":{"privateEndpoint":"private.invalid","secretRef":"worker-only"}}],"releases":[{"id":"postgres","version":"0.1.0","registryURL":"https://registry.example.test","kid":"trusted","jws":jws,"manifestRaw":raw,"descriptor":raw,"recipe":{"profile":"postgres","privatePath":"private-only"},"supportedFeatures":["create-dedicated"],"targetIDs":["local-eu"]}]})
}
