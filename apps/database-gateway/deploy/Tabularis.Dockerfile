FROM rust:1-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends libwebkit2gtk-4.1-dev libgtk-3-dev libxdo-dev libssl-dev pkg-config patchelf && rm -rf /var/lib/apt/lists/*
WORKDIR /source
COPY . .
ARG SOURCE_COMMIT
ENV TABULARIS_BUILD_COMMIT=$SOURCE_COMMIT CARGO_BUILD_JOBS=4 CARGO_PROFILE_RELEASE_LTO=false CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16
RUN cargo build --release --locked --manifest-path src-tauri/Cargo.toml --bin tabularis
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libwebkit2gtk-4.1-0 libgtk-3-0 libxdo3 libdbus-1-3 && rm -rf /var/lib/apt/lists/*
COPY --from=build /source/src-tauri/target/release/tabularis /usr/local/bin/tabularis
COPY packages/web-ui/dist /opt/tabularis/web
ENV TABULARIS_DATA_DIR=/data
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["tabularis", "web", "--host", "127.0.0.1", "--port", "8080", "--auth", "proxy", "--no-open", "--web-root", "/opt/tabularis/web"]
