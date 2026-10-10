FROM caddy:2-alpine
# Port 8443 needs no privileged-bind capability; file caps conflict with drop ALL.
RUN setcap -r /usr/bin/caddy
USER 65532:65532
