//! Router is mounted by Core at the retained /api/hosting/git/worker prefix.
use crate::{BuildService, Result, artifact::StoredArtifact, error};
use axum::{
    Router,
    body::{Body, to_bytes},
    extract::{Request, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
    routing::any,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::sync::Arc;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Artifact {
    kind: String,
    digest: String,
    storage_key: String,
    size_bytes: u64,
    image_digest: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Completion {
    #[serde(rename = "buildID")]
    build_id: String,
    generation: i32,
    status: String,
    logs: String,
    #[serde(default)]
    failure_code: Option<String>,
    #[serde(default)]
    artifact: Option<Artifact>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Release {
    #[serde(rename = "releaseID")]
    release_id: String,
    generation: i32,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Publish {
    #[serde(rename = "releaseID")]
    release_id: String,
    generation: i32,
    image: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReleaseComplete {
    #[serde(rename = "releaseID")]
    release_id: String,
    generation: i32,
    status: String,
    #[serde(default, rename = "operationID")]
    operation_id: Option<String>,
    #[serde(default)]
    health_verified: Option<bool>,
}
fn parse<T: serde::de::DeserializeOwned>(value: Value) -> Result<T> {
    serde_json::from_value(value).map_err(|_| error("invalid_command"))
}
fn lease(id: &str, generation: i32) -> Result<()> {
    crate::contracts::id(id)?;
    if generation <= 0 {
        return Err(error("invalid_generation"));
    }
    Ok(())
}
fn digest(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|v| {
        v.len() == 64
            && v.bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    })
}
pub fn worker_router(service: Arc<BuildService>) -> Router {
    Router::new()
        .route("/{*path}", any(handler))
        .with_state(service)
}
fn response(value: Value, status: u16) -> Response {
    let mut r = (
        StatusCode::from_u16(status).unwrap_or(StatusCode::SERVICE_UNAVAILABLE),
        axum::Json(value),
    )
        .into_response();
    r.headers_mut().insert(
        header::CACHE_CONTROL,
        header::HeaderValue::from_static("no-store"),
    );
    r
}
async fn handler(State(service): State<Arc<BuildService>>, request: Request) -> Response {
    match dispatch(&service, request).await {
        Ok(response) => response,
        Err(e) => response(json!({"error":e.code}), e.status()),
    }
}
async fn dispatch(service: &BuildService, request: Request) -> Result<Response> {
    let auth = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .filter(|v| {
            v.len() == 43
                && v.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
        })
        .ok_or_else(|| error("worker_authentication_failed"))?;
    let worker = service.authenticate_worker(auth).await?;
    let path = request
        .uri()
        .path()
        .trim_start_matches('/')
        .split('/')
        .collect::<Vec<_>>();
    if request.method() == "GET" {
        if path.len() != 3 || !matches!(path[0], "builds" | "releases") {
            return Err(error("endpoint_unavailable"));
        }
        let parameters =
            url::form_urlencoded::parse(request.uri().query().unwrap_or("").as_bytes())
                .collect::<Vec<_>>();
        if parameters.len() != 1
            || parameters[0].0 != "generation"
            || parameters[0].1.starts_with('0')
            || !parameters[0].1.bytes().all(|b| b.is_ascii_digit())
        {
            return Err(error("invalid_generation"));
        }
        let generation = parameters[0]
            .1
            .parse::<i32>()
            .map_err(|_| error("invalid_generation"))?;
        lease(path[1], generation)?;
        match (path[0], path[2]) {
            ("builds", "lease") => service.guard_build(&worker, path[1], generation).await?,
            ("releases", "lease") => service.guard_release(&worker, path[1], generation).await?,
            ("builds", "archive") => {
                let bytes = service.source_archive(&worker, path[1], generation).await?;
                if bytes.len() as u64 > crate::artifact::MAX_SOURCE {
                    return Err(error("source_limit"));
                }
                let mut r = Response::new(Body::from(bytes));
                r.headers_mut().insert(
                    header::CONTENT_TYPE,
                    header::HeaderValue::from_static("application/x-tar"),
                );
                r.headers_mut().insert(
                    header::CACHE_CONTROL,
                    header::HeaderValue::from_static("no-store"),
                );
                return Ok(r);
            }
            _ => return Err(error("endpoint_unavailable")),
        }
        return Ok(response(json!({"active":true}), 200));
    }
    if request.method() != "POST" || path.len() != 1 || request.uri().query().is_some() {
        return Err(error("endpoint_unavailable"));
    }
    let endpoint = path[0].to_owned();
    if request
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_none_or(|v| v.split(';').next() != Some("application/json"))
    {
        return Err(error("invalid_content_type"));
    }
    let bytes = to_bytes(request.into_body(), 400000)
        .await
        .map_err(|_| error("request_limit"))?;
    let input: Value = serde_json::from_slice(&bytes).map_err(|_| error("invalid_json"))?;
    let output = match endpoint.as_str() {
        "claim" => {
            if input != json!({}) {
                return Err(error("invalid_command"));
            }
            service
                .claim_build(&worker)
                .await?
                .map(|mut job| {
                    let request = job["request"].clone();
                    if let Some(object) = request.as_object() {
                        for (k, v) in object {
                            job[k] = v.clone();
                        }
                    }
                    job["buildProvider"] = json!("isolated");
                    job
                })
                .unwrap_or(Value::Null)
        }
        "complete" => {
            let value: Completion = parse(input)?;
            lease(&value.build_id, value.generation)?;
            if !matches!(value.status.as_str(), "succeeded" | "failed")
                || value.logs.len() > 262144
                || value.status == "succeeded" && value.artifact.is_none()
                || value.status == "failed" && value.artifact.is_some()
            {
                return Err(error("invalid_completion"));
            }
            let artifact = value
                .artifact
                .map(|a| {
                    if a.kind != "oci"
                        || !digest(&a.digest)
                        || !digest(&a.image_digest)
                        || a.size_bytes == 0
                        || a.size_bytes > crate::artifact::MAX_OUTPUT
                        || a.storage_key.len() > 240
                    {
                        return Err(error("invalid_artifact"));
                    }
                    let p = a.storage_key.split('/').collect::<Vec<_>>();
                    if p.len() != 4 {
                        return Err(error("invalid_artifact"));
                    }
                    for id in &p[..3] {
                        crate::contracts::id(id)?;
                    }
                    if p[1] != value.build_id
                        || p[2] != value.generation.to_string()
                        || p[3] != format!("{}.tar", &a.digest[7..])
                    {
                        return Err(error("artifact_scope_mismatch"));
                    }
                    Ok(StoredArtifact {
                        key: a.storage_key,
                        digest: a.digest,
                        size: a.size_bytes,
                        image_digest: a.image_digest,
                    })
                })
                .transpose()?;
            let failure = if value.status == "failed" {
                Some(value.failure_code.as_deref().unwrap_or("BUILD_FAILED"))
            } else {
                if value.failure_code.is_some() {
                    return Err(error("invalid_completion"));
                }
                None
            };
            service
                .complete_build(
                    &worker,
                    &value.build_id,
                    value.generation,
                    artifact.as_ref(),
                    &value.logs,
                    failure,
                )
                .await?
        }
        "release-claim" => {
            if input != json!({}) {
                return Err(error("invalid_command"));
            }
            service.claim_release(&worker).await?.map(|r|json!({"releaseID":r["id"],"customerID":r["customer_id"],"projectID":r["project_id"],"buildID":r["build_id"],"generation":r["generation"],"leaseUntil":r["lease_until"],"artifact":{"kind":"oci","digest":r["digest"],"storageKey":r["storage_key"],"sizeBytes":r["size_bytes"],"imageDigest":r["image_digest"]}})).unwrap_or(Value::Null)
        }
        "release-prepare" => {
            let r: Release = parse(input)?;
            lease(&r.release_id, r.generation)?;
            let mut result = service
                .prepare_publication(&worker, &r.release_id, r.generation)
                .await?;
            result["kind"] = json!("oci");
            result
        }
        "container-publish" => {
            let r: Publish = parse(input)?;
            lease(&r.release_id, r.generation)?;
            let result = service
                .publish_image(&worker, &r.release_id, r.generation, &r.image)
                .await?;
            json!({"operationID":result["id"],"status":"deploying"})
        }
        "observe" => {
            let r: Release = parse(input)?;
            lease(&r.release_id, r.generation)?;
            service
                .observe_release(&worker, &r.release_id, r.generation)
                .await?
        }
        "release-complete" => {
            let r: ReleaseComplete = parse(input)?;
            lease(&r.release_id, r.generation)?;
            match r.status.as_str() {
                "needs-reconciliation" | "failed" => {
                    service
                        .publication_uncertain(&worker, &r.release_id, r.generation)
                        .await?;
                    json!({"id":r.release_id,"status":"needs-reconciliation"})
                }
                "ready" | "deploying" => {
                    let result = service
                        .observe_release(&worker, &r.release_id, r.generation)
                        .await?;
                    if r.operation_id
                        .as_ref()
                        .is_some_and(|id| result["operationID"] != *id)
                        || r.status == "ready"
                            && (result["status"] != "ready" || r.health_verified != Some(true))
                    {
                        return Err(error("publication_proof_conflict"));
                    }
                    result
                }
                _ => return Err(error("invalid_release_status")),
            }
        }
        _ => return Err(error("endpoint_unavailable")),
    };
    Ok(response(output, 200))
}
