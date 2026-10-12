# Disposable qualification node only; never deploy this privileged test image.
FROM python:3.12-alpine AS tools
RUN apk add --no-cache e2fsprogs util-linux
FROM rancher/k3s:v1.36.5-k3s1@sha256:057cfd5a9d51b89f1f0ee139c28d5d5fdd5aa7ddeac2742a0ba90c6dbc0329bb
COPY --from=tools /usr/ /usr/
COPY --from=tools /lib/ /lib/
COPY --from=tools /sbin/ /sbin/
COPY --from=tools /bin/findmnt /bin/findmnt
ENV PATH=/bin/aux:/usr/local/bin:/usr/bin:/usr/sbin:/sbin:/bin
