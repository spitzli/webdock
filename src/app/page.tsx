import { ThemePicker } from '@/components/theme-picker';
import { Dock } from '@/components/dock';
import { contact, faqs } from '@/lib/content';
function Mark() { return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M7 9v22l9 8 8-8 8 8 9-8V9M24 9v22" stroke="currentColor" strokeWidth="5" strokeLinejoin="round"/></svg>; }
export default function Home() {
  const structuredData = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Organization', '@id': 'https://spitzli.dev/#organization', name: 'Spitzli Development', url: 'https://spitzli.dev' },
    { '@type': 'WebSite', '@id': 'https://webdock.dev/#website', name: 'Webdock', url: 'https://webdock.dev', inLanguage: 'en', description: 'Project previews and client websites by Spitzli Development.', publisher: { '@id': 'https://spitzli.dev/#organization' } },
    { '@type': 'FAQPage', '@id': 'https://webdock.dev/#faq', mainEntity: faqs.map(({ question, answer }) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } })) },
  ] };
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}/>
    <a className="skip-link" href="#content">Skip to content</a>
    <header className="site-header wrap flex items-center justify-between">
      <a href="#" className="brand" aria-label="Webdock home"><Mark/>webdock<span className="brand-period">.</span></a>
      <nav aria-label="Main navigation" className="flex items-center gap-8"><a className="nav-section" href="#concept">The idea</a><a className="nav-section" href="#faq">FAQ</a><a className="nav-contact" href={contact}>Start a project <span aria-hidden="true">↗</span></a></nav>
    </header>
    <main id="content">
      <section className="hero wrap">
        <div className="hero-copy"><a className="byline" href="https://spitzli.dev"><span className="small-mark">✳</span> A home for projects by Spitzli</a>
          <h1>Your project.<br/>Well docked.</h1>
          <p className="hero-description">From the first preview to the finished website. Webdock gives your project a place to call home.</p>
          <div className="hero-actions flex flex-wrap items-center gap-6"><a className="button" href={contact}>Let’s get you docked <span aria-hidden="true">↗</span></a><a className="text-link" href="#concept">Explore Webdock <span aria-hidden="true">↓</span></a></div>
          <p className="hero-note"><span/>Your subdomain. Or your own domain.</p>
        </div>
        <Dock/>
      </section>
      <div className="address-strip"><div className="wrap flex flex-wrap items-center justify-between gap-4"><span>Every idea needs a place.</span><p><span>your-project</span><strong>.webdock.dev</strong><span className="address-cursor" aria-hidden="true"/></p></div></div>
      <section id="concept" className="concept wrap section-space">
        <div><h2>From “take a look”<br/>to “we’re live”.</h2><p className="section-intro">Some projects need a link to get started. Others need a lasting home. Webdock is here for both.</p><a className="text-link" href="https://spitzli.dev">Built by Spitzli <span aria-hidden="true">↗</span></a></div>
        <div className="use-cases"><article><span className="case-icon" aria-hidden="true">▧</span><div><h3>Share it before you ship it.</h3><p>A dedicated address for your work in progress. Review it together, share feedback and make the next version better.</p></div></article><article><span className="case-icon" aria-hidden="true">⌁</span><div><h3>Your website. Your place.</h3><p>No domain of your own? Your project can live on a Webdock subdomain. Easy to share, easy to find again.</p></div></article><article><span className="case-icon" aria-hidden="true">↗</span><div><h3>Ready for what comes next.</h3><p>When you’re ready for your own domain, we’ll work out the connection. The setup grows with your project.</p></div></article></div>
      </section>
      <section className="spitzli-section"><div className="wrap spitzli-inner"><div className="spitzli-symbol" aria-hidden="true">s<span>.</span></div><div><p className="subtle-label">Webdock × Spitzli Development</p><h2>A home online.<br/>A human on your side.</h2></div><div className="spitzli-copy"><p>Webdock is run by Dominik at Spitzli Development. From the first idea to deployment, you work directly with the person building your project.</p><a className="text-link" href="https://spitzli.dev">Meet Spitzli <span aria-hidden="true">↗</span></a></div></div></section>
      <section id="faq" className="faq wrap section-space"><div><h2>Good questions.<br/>Straight answers.</h2><p className="section-intro">Something else on your mind?<br/><a href={contact}>Just ask.</a></p></div><div className="faq-list">{faqs.map(({question, answer}) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>
      <section className="outlook wrap"><span className="outlook-icon" aria-hidden="true">⌘</span><div><h3>Your link today. Your dashboard tomorrow.</h3><p>A dedicated console for your projects is planned. Until then, we’ll take care of things personally.</p></div><span className="planned">Planned</span></section>
      <section className="closing wrap"><p>Got something in mind?</p><h2>There’s a place<br/>for your next idea.</h2><a className="button" href={contact}>Let’s talk about it <span aria-hidden="true">↗</span></a><span className="closing-mark" aria-hidden="true"><Mark/></span></section>
    </main>
    <footer className="wrap site-footer"><a className="brand" href="#" aria-label="Webdock home"><Mark/>webdock.</a><p>A project by <a href="https://spitzli.dev">Spitzli Development</a></p><a href="mailto:dominik@spitzli.dev">dominik@spitzli.dev <span aria-hidden="true">↗</span></a><ThemePicker/></footer>
  </>;
}
