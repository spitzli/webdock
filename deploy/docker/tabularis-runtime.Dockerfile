# Repackage only the explicitly verified runtime recorded by the release inputs.
ARG TABULARIS_IMAGE
FROM ${TABULARIS_IMAGE}
ARG TABULARIS_SOURCE_COMMIT
LABEL org.opencontainers.image.source="https://github.com/TabularisDB/tabularis" webdock.dev.tabularis-source=$TABULARIS_SOURCE_COMMIT
