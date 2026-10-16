#!/usr/bin/env bash
# Explicit operator action. Never called by the candidate workflow.
set -euo pipefail
out=${1:?Usage: publish.sh DIRECTORY OCI_REGISTRY GITHUB_REPOSITORY}
registry=${2:?OCI registry/repository required}
repository=${3:?GitHub repository required}
: "${RELEASE_CERTIFICATE_IDENTITY:?Expected signing workflow identity required}"
: "${RELEASE_CERTIFICATE_OIDC_ISSUER:?Expected OIDC issuer required}"
cosign verify-blob --bundle "$out/SHA256SUMS.sigstore.json" \
  --certificate-identity "$RELEASE_CERTIFICATE_IDENTITY" \
  --certificate-oidc-issuer "$RELEASE_CERTIFICATE_OIDC_ISSUER" "$out/SHA256SUMS"
(cd "$out" && sha256sum --check SHA256SUMS)
node tools/release/manifest.mjs verify "$out"
version=$(node --input-type=module -e 'import {readFileSync} from "node:fs"; console.log(JSON.parse(readFileSync(process.argv[1])).version)' "$out/manifest.json")
for image in console auth api worker migrate agent mail-runtime; do
  skopeo copy --all --preserve-digests "oci-archive:$out/$image.oci.tar" "docker://$registry/$image:$version"
done
if [ -f "$out/database-gateway.oci.tar" ]; then
  for image in database-gateway tabularis-runtime; do
    skopeo copy --all --preserve-digests "oci-archive:$out/$image.oci.tar" "docker://$registry/$image:$version"
  done
  helm push "$out/webdock-databases-$version.tgz" "oci://$registry/charts"
fi
helm push "$out/webdock-$version.tgz" "oci://$registry/charts"
helm push "$out/webdock-agent-$version.tgz" "oci://$registry/charts"
gh release create "v$version" --repo "$repository" --draft --verify-tag --title "Webdock $version" --notes 'Candidate artifacts; review installation and migration gates before rollout.' "$out/manifest.json" "$out/architecture-evidence.json" "$out/SHA256SUMS" "$out/SHA256SUMS.sigstore.json" "$out/"*.tgz
