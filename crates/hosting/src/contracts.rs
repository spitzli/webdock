use crate::{Result, error};
use serde_json::{Value, json};
use std::sync::OnceLock;
pub const DIMENSIONS: [&str; 7] = [
    "apps",
    "cpuMillicores",
    "memoryBytes",
    "volumeBytes",
    "ephemeralBytes",
    "replicasPerApp",
    "concurrentDeployments",
];
pub const MAX_SAFE: u64 = 9_007_199_254_740_991;
pub fn record_id(value: &str) -> Result<()> {
    if value.is_empty()
        || value.starts_with('0')
        || !value.bytes().all(|v| v.is_ascii_digit())
        || value.parse::<i64>().is_err()
    {
        return Err(error(400, "Invalid resource ID."));
    }
    Ok(())
}
pub(crate) fn amount(value: &Value) -> Result<u64> {
    value
        .as_f64()
        .filter(|n| n.is_finite() && n.fract() == 0.0 && *n >= 0.0 && *n <= MAX_SAFE as f64)
        .map(|n| n as u64)
        .ok_or_else(|| error(400, "Invalid resource quantity."))
}
pub(crate) fn validator(source: &str) -> jsonschema::Validator {
    jsonschema::options()
        .should_validate_formats(true)
        .build(&serde_json::from_str::<Value>(source).unwrap())
        .unwrap()
}
pub fn command_document() -> Value {
    let mut schema: Value =
        serde_json::from_str(include_str!("legacy-command.schema.json")).unwrap();
    fn extend(value: &mut Value) {
        if let Some(map) = value.as_object_mut() {
            if map.get("enum") == Some(&json!(["k3s", "vercel"])) {
                map.insert("enum".into(), json!(["k3s", "vercel", "docker"]));
            }
            if map
                .get("properties")
                .and_then(|v| v.get("action"))
                .and_then(|v| v.get("const"))
                .is_some_and(|v| v == "clusters.register")
            {
                map["properties"].as_object_mut().unwrap().insert(
                    "runtimeKind".into(),
                    json!({"enum":["kubernetes","docker"]}),
                );
            }
            for child in map.values_mut() {
                extend(child);
            }
        } else if let Some(array) = value.as_array_mut() {
            for child in array {
                extend(child);
            }
        }
    }
    extend(&mut schema);
    if let Some(variants) = schema["oneOf"].as_array_mut()
        && let Some(logs) = variants
            .iter()
            .find(|v| v["properties"]["action"]["const"] == "apps.logs")
            .cloned()
    {
        for action in ["apps.inspect", "apps.metrics"] {
            let mut read = logs.clone();
            read["properties"]["action"]["const"] = json!(action);
            variants.push(read);
        }
    }
    schema
}
fn command_schema() -> &'static jsonschema::Validator {
    static SCHEMA: OnceLock<jsonschema::Validator> = OnceLock::new();
    SCHEMA.get_or_init(|| {
        jsonschema::options()
            .should_validate_formats(true)
            .build(&command_document())
            .expect("bundled hosting schema")
    })
}
pub fn parse_command(mut value: Value) -> Result<Value> {
    if serde_json::to_vec(&value)
        .map_err(|_| error(400, "Invalid hosting input."))?
        .len()
        > 65536
    {
        return Err(error(400, "Hosting input exceeds limit."));
    }
    if let Some(action) = value.get("action").and_then(Value::as_str)
        && (["git.", "byok.", "databases.", "setup.", "services."]
            .iter()
            .any(|prefix| action.starts_with(prefix))
            || ["projects.overview", "projects.relocate"].contains(&action))
    {
        return Err(error(
            503,
            "This hosting capability requires its configured adapter.",
        ));
    }
    normalize_numbers(&mut value);
    if let Some(object) = value.as_object_mut() {
        for key in [
            "name",
            "confirmName",
            "provider",
            "region",
            "locationEvidence",
        ] {
            if let Some(Value::String(text)) = object.get_mut(key) {
                *text = text.trim().to_owned();
            }
        }
    }
    if !command_schema().is_valid(&value) {
        return Err(error(400, "Invalid hosting input."));
    }
    for (key, v) in value.as_object().unwrap() {
        if key.ends_with("ID") && v.is_string() {
            record_id(v.as_str().unwrap())?;
        }
    }
    let action = value["action"].as_str().unwrap().to_owned();
    if [
        "apps.list",
        "projects.list",
        "clusters.list",
        "operations.overview",
    ]
    .contains(&action.as_str())
    {
        for (key, default) in [
            ("page", json!(1)),
            ("limit", json!(20)),
            ("search", json!("")),
        ] {
            if value.get(key).is_none() {
                value[key] = default;
            }
        }
    }
    if action == "projects.create" {
        for key in ["ownImages", "confirmSharedImages"] {
            if value.get(key).is_none() {
                value[key] = json!(false);
            }
        }
    }
    if action == "projects.update" && value.get("confirmSharedImages").is_none() {
        value["confirmSharedImages"] = json!(false);
    }
    if let Some(spec) = value.get("spec") {
        if spec["args"].as_array().is_some_and(|args| {
            args.iter().any(|a| {
                a.as_str()
                    .is_none_or(|s| s.encode_utf16().count() > 512 || s.contains('\0'))
            })
        }) {
            return Err(error(400, "Invalid application arguments."));
        }
        if action != "apps.prepare" {
            resolve_spec(spec.clone())?;
        } else if amount(&spec["replicas"])? > 1
            && spec
                .get("volumeBytes")
                .map(amount)
                .transpose()?
                .unwrap_or(0)
                > 0
        {
            return Err(error(400, "Persistent storage supports one instance."));
        }
    }
    if let Some(environment) = value.get("environment") {
        crate::environment::validate_patch(environment)?;
    }
    Ok(value)
}
pub fn resolve_spec(mut value: Value) -> Result<Value> {
    normalize_numbers(&mut value);
    static SPEC: OnceLock<jsonschema::Validator> = OnceLock::new();
    if !SPEC
        .get_or_init(|| validator(include_str!("app-spec.schema.json")))
        .is_valid(&value)
    {
        return Err(error(400, "Invalid application specification."));
    }
    if let Some(volume) = value.get("volumeBytes") {
        let volume = amount(volume)?;
        if (volume > 0 && volume < 67108864) || (volume > 0 && amount(&value["replicas"])? > 1) {
            return Err(error(
                400,
                "Persistent storage supports one instance and at least 64 MiB.",
            ));
        }
    }
    if value["template"] == "healthcheck" {
        value["image"] = json!(
            "docker.io/rancher/mirrored-library-traefik@sha256:f86a2cab1b5c649070c49f883c743dd32d8485a56e3368c5f93b9e91f1e91259"
        );
        value["args"] = json!([
            "--entrypoints.web.address=:8080",
            "--ping",
            "--ping.entrypoint=web"
        ]);
        value["port"] = json!(8080);
        value["healthPath"] = json!("/ping");
    }
    Ok(value)
}
pub fn app_demand(spec: &Value, deleted: bool) -> Result<Value> {
    let replicas = if deleted {
        0
    } else {
        amount(&spec["replicas"])?
    };
    Ok(
        json!({"apps":if deleted{0}else{1},"cpuMillicores":amount(&spec["cpuMillicores"])?*replicas,"memoryBytes":amount(&spec["memoryBytes"])?*replicas,"volumeBytes":spec.get("volumeBytes").map(amount).transpose()?.unwrap_or(0),"ephemeralBytes":amount(&spec["ephemeralBytes"])?*replicas,"replicasPerApp":replicas,"concurrentDeployments":1}),
    )
}
pub fn allowances(value: Option<&Value>) -> Result<Value> {
    let mut result = json!({});
    if let Some(value) = value
        && (!value.is_object()
            || value
                .as_object()
                .unwrap()
                .keys()
                .any(|k| !DIMENSIONS.contains(&k.as_str())))
    {
        return Err(error(400, "Invalid hosting allowances."));
    }
    for key in DIMENSIONS {
        result[key] = match value.and_then(|v| v.get(key)) {
            Some(Value::Null) => Value::Null,
            Some(value) => json!(amount(value)?),
            None => json!(0),
        };
    }
    Ok(result)
}
pub fn totals(rows: &[Value]) -> Result<Value> {
    let mut result = allowances(None)?;
    for row in rows {
        for key in DIMENSIONS {
            let n = if key == "concurrentDeployments" && row["status"] == "active" {
                0
            } else {
                row["demand"]
                    .get(key)
                    .filter(|v| !v.is_null())
                    .map(amount)
                    .transpose()?
                    .unwrap_or(0)
            };
            let old = amount(&result[key])?;
            let next = if key == "replicasPerApp" {
                old.max(n)
            } else {
                old.checked_add(n)
                    .ok_or_else(|| error(409, "Allocated resources exceed supported range."))?
            };
            if next > MAX_SAFE {
                return Err(error(409, "Allocated resources exceed supported range."));
            }
            result[key] = json!(next);
        }
    }
    Ok(result)
}
pub(crate) fn observation(value: &Value) -> Result<()> {
    static SCHEMA: OnceLock<jsonschema::Validator> = OnceLock::new();
    let schema = SCHEMA.get_or_init(|| {
        let mut schema: Value =
            serde_json::from_str(include_str!("observation.schema.json")).unwrap();
        schema["properties"]["runtimeKind"] = json!({"enum":["kubernetes","docker"]});
        for key in ["volumeQuotas", "replicas"] {
            schema["properties"]["capabilities"]["properties"][key] = json!({"type":"boolean"});
        }
        jsonschema::options()
            .should_validate_formats(true)
            .build(&schema)
            .unwrap()
    });
    if !schema.is_valid(value) {
        return Err(error(400, "Invalid cluster observation."));
    }
    Ok(())
}

fn normalize_numbers(value: &mut Value) {
    match value {
        Value::Number(n) => {
            if let Some(v) = n
                .as_f64()
                .filter(|v| v.fract() == 0.0 && v.abs() <= MAX_SAFE as f64)
            {
                *value = if v >= 0.0 {
                    json!(v as u64)
                } else {
                    json!(v as i64)
                };
            }
        }
        Value::Array(v) => {
            for v in v {
                normalize_numbers(v)
            }
        }
        Value::Object(v) => {
            for v in v.values_mut() {
                normalize_numbers(v)
            }
        }
        _ => (),
    }
}
