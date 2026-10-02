import { ThemePicker } from '@/components/theme-picker';
import { Dock } from '@/components/dock';
import { contact, faqs } from '@/lib/content';
function Mark() { return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M7 9v22l9 8 8-8 8 8 9-8V9M24 9v22" stroke="currentColor" strokeWidth="5" strokeLinejoin="round"/></svg>; }
export default function Home() {
  const structuredData = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Organization', '@id': 'https://spitzli.dev/#organization', name: 'Spitzli Development', url: 'https://spitzli.dev' },
    { '@type': 'WebSite', '@id': 'https://webdock.dev/#website', name: 'Webdock', url: 'https://webdock.dev', inLanguage: 'de-DE', description: 'Vorschauseiten und Kundenwebsites von Spitzli Development.', publisher: { '@id': 'https://spitzli.dev/#organization' } },
    { '@type': 'FAQPage', '@id': 'https://webdock.dev/#fragen', mainEntity: faqs.map(({ question, answer }) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } })) },
  ] };
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}/>
    <a className="skip-link" href="#inhalt">Zum Inhalt</a>
    <header className="site-header wrap flex items-center justify-between">
      <a href="#" className="brand" aria-label="Webdock Startseite"><Mark/>webdock<span className="brand-period">.</span></a>
      <nav aria-label="Hauptnavigation" className="flex items-center gap-8"><a className="nav-section" href="#konzept">Das Konzept</a><a className="nav-section" href="#fragen">Fragen</a><a className="nav-contact" href={contact}>Projekt anfragen <span aria-hidden="true">↗</span></a></nav>
    </header>
    <main id="inhalt">
      <section className="hero wrap">
        <div className="hero-copy"><a className="byline" href="https://spitzli.dev"><span className="small-mark">✳</span> Ein Zuhause für Projekte von Spitzli</a>
          <h1>Dein Projekt.<br/>Gut angedockt.</h1>
          <p className="hero-description">Von der ersten Vorschau bis zur fertigen Website. Webdock gibt deinem Projekt einen festen Platz im Web.</p>
          <div className="hero-actions flex flex-wrap items-center gap-6"><a className="button" href={contact}>Lass uns anlegen <span aria-hidden="true">↗</span></a><a className="text-link" href="#konzept">Webdock kennenlernen <span aria-hidden="true">↓</span></a></div>
          <p className="hero-note"><span/>Deine Subdomain. Oder deine eigene Domain.</p>
        </div>
        <Dock/>
      </section>
      <div className="address-strip"><div className="wrap flex flex-wrap items-center justify-between gap-4"><span>Eine Idee braucht einen Ort.</span><p><span>dein-projekt</span><strong>.webdock.dev</strong><span className="address-cursor" aria-hidden="true"/></p></div></div>
      <section id="konzept" className="concept wrap section-space">
        <div><h2>Vom „Schau mal“<br/>zum „Wir sind online“.</h2><p className="section-intro">Manche Projekte brauchen erstmal einen Link. Andere einen dauerhaften Platz. Webdock ist für beides da.</p><a className="text-link" href="https://spitzli.dev">Entwickelt von Spitzli <span aria-hidden="true">↗</span></a></div>
        <div className="use-cases"><article><span className="case-icon" aria-hidden="true">▧</span><div><h3>Zeigen, bevor es live geht.</h3><p>Eine feste Adresse für deinen Entwurf. Gemeinsam ansehen, Feedback geben und die nächste Version besser machen.</p></div></article><article><span className="case-icon" aria-hidden="true">⌁</span><div><h3>Deine Website. Dein Platz.</h3><p>Keine eigene Domain? Dein Projekt ist über eine passende Webdock-Subdomain erreichbar. Einfach weitergeben, einfach wiederfinden.</p></div></article><article><span className="case-icon" aria-hidden="true">↗</span><div><h3>Bereit für den nächsten Schritt.</h3><p>Wenn eine eigene Domain dazukommt, stimmen wir die Anbindung ab. Die technische Basis folgt deinem Projekt.</p></div></article></div>
      </section>
      <section className="spitzli-section"><div className="wrap spitzli-inner"><div className="spitzli-symbol" aria-hidden="true">s<span>.</span></div><div><p className="subtle-label">Webdock × Spitzli Development</p><h2>Ein fester Platz.<br/>Ein direkter Draht.</h2></div><div className="spitzli-copy"><p>Hinter Webdock steht Dominik von Spitzli Development. Von der ersten Idee bis zur Bereitstellung sprechen wir direkt miteinander.</p><a className="text-link" href="https://spitzli.dev">Spitzli kennenlernen <span aria-hidden="true">↗</span></a></div></div></section>
      <section id="fragen" className="faq wrap section-space"><div><h2>Gut zu wissen.<br/>Kurz beantwortet.</h2><p className="section-intro">Noch etwas offen?<br/><a href={contact}>Frag mich einfach.</a></p></div><div className="faq-list">{faqs.map(({question, answer}) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>
      <section className="outlook wrap"><span className="outlook-icon" aria-hidden="true">⌘</span><div><h3>Heute dein Link. Morgen dein Überblick.</h3><p>Eine eigene Console für deine Projekte ist geplant. Bis dahin kümmern wir uns persönlich.</p></div><span className="planned">In Planung</span></section>
      <section className="closing wrap"><p>Schon eine Idee im Kopf?</p><h2>Hier ist noch<br/>ein Platz für dich.</h2><a className="button" href={contact}>Projekt besprechen <span aria-hidden="true">↗</span></a><span className="closing-mark" aria-hidden="true"><Mark/></span></section>
    </main>
    <footer className="wrap site-footer"><a className="brand" href="#" aria-label="Webdock Startseite"><Mark/>webdock.</a><p>Ein Projekt von <a href="https://spitzli.dev">Spitzli Development</a></p><a href="mailto:dominik@spitzli.dev">dominik@spitzli.dev <span aria-hidden="true">↗</span></a><ThemePicker/></footer>
  </>;
}
