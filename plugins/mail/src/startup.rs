//! Listener-scoped retained reconciliation: candidates can be probed without customer effects.
use std::{future::Future, time::Duration};
use webdock_plugin_runtime::HostClient;

pub(super) async fn serve<S, H, F, R, E>(
    server: impl FnOnce(tokio::sync::oneshot::Receiver<()>) -> S,
    shutdown: H,
    client: HostClient,
    plugin: &str,
    generation: u64,
    resume: F,
) -> Result<(), crate::Error>
where
    S: Future<Output = Result<(), crate::Error>>,
    H: Future<Output = ()>,
    F: FnMut() -> R,
    R: Future<Output = Result<(), E>>,
{
    let (stop, stopped) = tokio::sync::oneshot::channel();
    let mut server = std::pin::pin!(server(stopped));
    let mut shutdown = std::pin::pin!(shutdown);
    {
        let mut startup =
            std::pin::pin!(resume_when_authorized(client, plugin, generation, resume));
        tokio::select! {
            biased;
            () = &mut shutdown => {}
            result = &mut server => return result,
            () = &mut startup => {
                tokio::select! {
                    biased;
                    () = &mut shutdown => {}
                    result = &mut server => return result,
                }
            }
        }
    }
    // Drop startup before asking tonic to drain: active requests must not prolong its authority.
    let _ = stop.send(());
    server.await
}

async fn resume_when_authorized<F, R, E>(
    client: HostClient,
    plugin: &str,
    generation: u64,
    mut resume: F,
) where
    F: FnMut() -> R,
    R: Future<Output = Result<(), E>>,
{
    let mut backoff = Duration::from_millis(100);
    loop {
        if client.authorize_runtime(plugin, generation).await.is_ok() {
            if resume().await.is_ok() {
                return;
            }
            eprintln!("mail_plugin_resume_pending");
        }
        tokio::time::sleep(backoff).await;
        backoff = (backoff * 2).min(Duration::from_secs(5));
    }
}

#[cfg(test)]
#[path = "startup_tests.rs"]
mod tests;
