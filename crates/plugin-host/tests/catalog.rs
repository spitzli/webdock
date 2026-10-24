use serde_json::json;
use webdock_plugin_host::catalog::Catalog;
#[path = "support/catalog_fixture.rs"]
mod catalog_fixture;
use catalog_fixture::catalog;

#[test]
fn review_binds_private_recipe_target_and_trusted_key_without_disclosing_them() {
    let raw = catalog();
    let catalog = Catalog::from_bytes(&serde_json::to_vec(&raw).unwrap()).unwrap();
    let public = serde_json::to_value(catalog.descriptors()).unwrap();
    assert_eq!(public[0]["targets"][0]["id"], "local-eu");
    assert!(!public.to_string().contains("private"));
    for mutate in ["recipe", "target"] {
        let mut changed = raw.clone();
        if mutate == "recipe" {
            changed["releases"][0]["recipe"]["profile"] = json!("changed");
        } else {
            changed["targets"][0]["policy"]["secretRef"] = json!("different");
        }
        let changed = Catalog::from_bytes(&serde_json::to_vec(&changed).unwrap()).unwrap();
        assert_ne!(
            public[0]["targets"][0]["reviewSha256"],
            serde_json::to_value(changed.descriptors()).unwrap()[0]["targets"][0]["reviewSha256"]
        );
    }
}
#[test]
fn catalog_rejects_untrusted_release_duplicate_identity_and_feature_invention() {
    let raw = catalog();
    for case in 0..5 {
        let mut value = raw.clone();
        match case {
            0 => value["keys"][0]["kid"] = json!("other"),
            1 => {
                let release = value["releases"][0].clone();
                value["releases"].as_array_mut().unwrap().push(release);
            }
            2 => value["releases"][0]["supportedFeatures"] = json!(["invented"]),
            3 => value["releases"][0]["targetIDs"] = json!(["missing"]),
            _ => value["keys"][0]["key"]["d"] = json!("private"),
        }
        assert!(
            Catalog::from_bytes(&serde_json::to_vec(&value).unwrap()).is_err(),
            "case {case}"
        );
    }
    let bytes = raw.to_string().replacen('{', "{\"version\":1,", 1);
    assert!(Catalog::from_bytes(bytes.as_bytes()).is_err());
}
