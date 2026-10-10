FROM stalwartlabs/stalwart:v0.16.25@sha256:74e5a7d55303ba525d939c6bf97ed4e010df7521f52d80afc22a815b66bd53f3

# The Webdock cluster drops all capabilities. Stalwart uses configured high ports;
# its upstream file capability would otherwise prevent exec under that policy.
USER 0
RUN setcap -r /usr/local/bin/stalwart
USER 65532:65532
CMD ["--config", "/data/config.json"]
