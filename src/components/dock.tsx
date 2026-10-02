export function Dock() {
  return <figure className="dock" aria-label="Illustration: Vorschau, Website und eigene Domain sind mit Webdock verbunden.">
    <div className="dock-top"><span>Ein Platz für dein nächstes Projekt.</span><span className="dock-coordinate">⌖ webdock.dev</span></div>
    <svg className="dock-lines" viewBox="0 0 640 540" fill="none" aria-hidden="true"><path d="M155 134H260Q285 134 285 159V280M492 212H390Q365 212 365 237V280M320 325V397Q320 425 348 425H463"/><path d="M0 470H640M0 490H640M0 510H640" className="water"/><circle cx="285" cy="205" r="5"/><circle cx="365" cy="254" r="5"/><circle cx="380" cy="425" r="5"/></svg>
    <div className="project-node preview-node"><span className="node-symbol">▧</span><span>Raum für Ideen<small>studio.webdock.dev</small></span><span className="node-type">Vorschau</span></div>
    <div className="project-node website-node"><span className="node-symbol">↗</span><span>Bereit für die Welt<small>projekt.webdock.dev</small></span><span className="node-type">Website</span></div>
    <div className="dock-hub"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 9v22l9 8 8-8 8 8 9-8V9M24 9v22"/></svg><span>webdock</span></div>
    <div className="domain-node"><span className="domain-dot"/>deine-domain.de<span>↗</span></div>
    <figcaption>Beispieladressen. Dein Projekt bekommt seinen eigenen Platz.</figcaption>
  </figure>;
}
