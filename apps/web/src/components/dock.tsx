import {getRequestI18n} from '@webdock/i18n/next';
export async function Dock() {
  const {t}=await getRequestI18n();
  return <figure className="dock" aria-label={t("Illustration: a preview, a website and a custom domain connected to Webdock.")}>
    <div className="dock-top"><span>{t("A place for your next project.")}</span><span className="dock-coordinate">{"⌖ webdock.dev"}</span></div>
    <svg className="dock-lines" viewBox="0 0 640 540" fill="none" aria-hidden="true"><path d="M155 134H260Q285 134 285 159V280M492 212H390Q365 212 365 237V280M320 325V397Q320 425 348 425H463"/><path d="M0 470H640M0 490H640M0 510H640" className="water"/><circle cx="285" cy="205" r="5"/><circle cx="365" cy="254" r="5"/><circle cx="380" cy="425" r="5"/></svg>
    <div className="project-node preview-node"><span className="node-symbol">▧</span><span>{t("Room for ideas")}<small>{"studio.webdock.dev"}</small></span><span className="node-type">{t("Preview")}</span></div>
    <div className="project-node website-node"><span className="node-symbol">↗</span><span>{t("Ready for the world")}<small>{"project.webdock.dev"}</small></span><span className="node-type">{t("Website")}</span></div>
    <div className="dock-hub"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 9v22l9 8 8-8 8 8 9-8V9M24 9v22"/></svg><span>{"webdock"}</span></div>
    <div className="domain-node"><span className="domain-dot"/>{"your-domain.com"}<span>↗</span></div>
    <figcaption>{t("Example addresses. Your project gets a place of its own.")}</figcaption>
  </figure>;
}
