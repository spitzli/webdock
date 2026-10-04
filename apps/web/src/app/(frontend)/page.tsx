import { ThemePicker } from '@/components/theme-picker';
import { Dock } from '@/components/dock';
import { getLanding } from '@/lib/landing';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const page = await getLanding();
  return { title: page.seoTitle, description: page.seoDescription, openGraph: { title: page.seoTitle, description: page.seoDescription, images: ['/og.png'] }, twitter: { title: page.seoTitle, description: page.seoDescription, card: 'summary_large_image', images: ['/og.png'] } };
}

function Mark() { return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M7 9v22l9 8 8-8 8 8 9-8V9M24 9v22" stroke="currentColor" strokeWidth="5" strokeLinejoin="round"/></svg>; }
export default async function Home() {
  const page = await getLanding();
  const faqs = page.faqs;
  const contact = `mailto:${page.contactEmail}?subject=My%20project%20with%20Webdock`;
  const structuredData = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Organization', '@id': 'https://spitzli.dev/#organization', name: 'Spitzli Development', url: 'https://spitzli.dev' },
    { '@type': 'WebSite', '@id': 'https://webdock.dev/#website', name: 'Webdock', url: 'https://webdock.dev', inLanguage: 'en', description: page.seoDescription, publisher: { '@id': 'https://spitzli.dev/#organization' } },
    ...(faqs.length ? [{ '@type': 'FAQPage', '@id': 'https://webdock.dev/#faq', mainEntity: faqs.map(({ question, answer }) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } })) }] : []),
  ] };
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}/>
    <a className="skip-link" href="#content">Skip to content</a>
    <header className="site-header wrap flex items-center justify-between">
      <a href="#" className="brand" aria-label="Webdock home"><Mark/>webdock<span className="brand-period">.</span></a>
      <nav aria-label="Main navigation" className="flex items-center gap-8"><a className="nav-section" href="#concept">The idea</a>{faqs.length > 0 && <a className="nav-section" href="#faq">FAQ</a>}<a className="nav-contact" href={contact}>Start a project <span aria-hidden="true">↗</span></a></nav>
    </header>
    <main id="content">
      <section className="hero wrap">
        <div className="hero-copy"><a className="byline" href="https://spitzli.dev" target="_blank" rel="noopener noreferrer"><span className="small-mark">✳</span> A home for projects by Spitzli</a>
          <h1 className="whitespace-pre-line">{page.heroTitle}</h1>
          <p className="hero-description">{page.heroDescription}</p>
          <div className="hero-actions flex flex-wrap items-center gap-6"><a className="button" href={contact}>{page.heroButton} <span aria-hidden="true">↗</span></a><a className="text-link" href="#concept">Explore Webdock <span aria-hidden="true">↓</span></a></div>
          <p className="hero-note"><span/>{page.heroNote}</p>
        </div>
        <Dock/>
      </section>
      <div className="address-strip"><div className="wrap flex flex-wrap items-center justify-between gap-4"><span>Every idea needs a place.</span><p><span>your-project</span><strong>.webdock.dev</strong><span className="address-cursor" aria-hidden="true"/></p></div></div>
      <section id="concept" className="concept wrap section-space">
        <div><h2 className="whitespace-pre-line">{page.conceptTitle}</h2><p className="section-intro">{page.conceptDescription}</p><a className="text-link" href="https://spitzli.dev" target="_blank" rel="noopener noreferrer">Built by Spitzli <span aria-hidden="true">↗</span></a></div>
        <div className="use-cases">{page.useCases.map((item, index) => <article key={item.id}><span className="case-icon" aria-hidden="true">{['▧', '⌁', '↗'][index % 3]}</span><div><h3>{item.title}</h3><p>{item.description}</p></div></article>)}</div>
      </section>
      <section className="spitzli-section"><div className="wrap spitzli-inner"><div className="spitzli-symbol" aria-hidden="true">s<span>.</span></div><div><p className="subtle-label">Webdock × Spitzli Development</p><h2 className="whitespace-pre-line">{page.aboutTitle}</h2></div><div className="spitzli-copy"><p>{page.aboutDescription}</p><a className="text-link" href="https://spitzli.dev" target="_blank" rel="noopener noreferrer">Meet Spitzli <span aria-hidden="true">↗</span></a></div></div></section>
      {faqs.length > 0 && <section id="faq" className="faq wrap section-space"><div><h2 className="whitespace-pre-line">{page.faqTitle}</h2><p className="section-intro">Something else on your mind?<br/><a href={contact}>Just ask.</a></p></div><div className="faq-list">{faqs.map(({question, answer}) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>}
      <section className="outlook wrap"><span className="outlook-icon" aria-hidden="true">⌘</span><div><h3>{page.outlookTitle}</h3><p>{page.outlookDescription}</p></div><span className="planned">Planned</span></section>
      <section className="closing wrap"><p>Got something in mind?</p><h2 className="whitespace-pre-line">{page.closingTitle}</h2><a className="button" href={contact}>{page.closingButton} <span aria-hidden="true">↗</span></a><span className="closing-mark" aria-hidden="true"><Mark/></span></section>
    </main>
    <footer className="wrap site-footer"><a className="brand" href="#" aria-label="Webdock home"><Mark/>webdock.</a><p>A project by <a href="https://spitzli.dev" target="_blank" rel="noopener noreferrer">Spitzli Development</a></p><a href={`mailto:${page.contactEmail}`}>{page.contactEmail} <span aria-hidden="true">↗</span></a><nav aria-label="Legal"><a href="/terms">Terms of use</a><a href="/privacy">Privacy</a></nav><ThemePicker/></footer>
  </>;
}
