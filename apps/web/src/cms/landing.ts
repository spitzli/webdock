import type { Field, GlobalConfig } from 'payload';
import { faqs } from '../lib/content';
import { authenticated } from './access';

export const landingDefaults = {
  seoTitle: 'Webdock — Project previews & client websites by Spitzli',
  seoDescription: 'Your project. Well docked. A home for project previews and client websites by Spitzli Development — on a Webdock subdomain or your own domain.',
  contactEmail: 'dominik@spitzli.dev',
  heroTitle: 'Your project.\nWell docked.',
  heroDescription: 'From the first preview to the finished website. Webdock gives your project a place to call home.',
  heroButton: 'Let’s get you docked',
  heroNote: 'Your subdomain. Or your own domain.',
  conceptTitle: 'From “take a look”\nto “we’re live”.',
  conceptDescription: 'Some projects need a link to get started. Others need a lasting home. Webdock is here for both.',
  useCases: [
    { title: 'Share it before you ship it.', description: 'A dedicated address for your work in progress. Review it together, share feedback and make the next version better.' },
    { title: 'Your website. Your place.', description: 'No domain of your own? Your project can live on a Webdock subdomain. Easy to share, easy to find again.' },
    { title: 'Ready for what comes next.', description: 'When you’re ready for your own domain, we’ll work out the connection. The setup grows with your project.' },
  ],
  aboutTitle: 'A home online.\nA human on your side.',
  aboutDescription: 'Webdock is run by Dominik at Spitzli Development. From the first idea to deployment, you work directly with the person building your project.',
  faqTitle: 'Good questions.\nStraight answers.',
  faqs,
  outlookTitle: 'Your link today. Your dashboard tomorrow.',
  outlookDescription: 'A dedicated console for your projects is planned. Until then, we’ll take care of things personally.',
  closingTitle: 'There’s a place\nfor your next idea.',
  closingButton: 'Let’s talk about it',
};

const text = (name: Exclude<keyof typeof landingDefaults, 'faqs' | 'useCases'>, label: string, multiline = false): Field => {
  const base = { name, label, required: true, defaultValue: landingDefaults[name] };
  return multiline ? { ...base, type: 'textarea' } : { ...base, type: 'text' };
};

export const LandingPage: GlobalConfig = {
  slug: 'landing-page', label: 'Landing page',
  access: { read: authenticated, update: authenticated },
  fields: [
    { type: 'tabs', tabs: [
      { label: 'SEO & contact', fields: [text('seoTitle', 'Page title'), text('seoDescription', 'Description', true), { name: 'contactEmail', type: 'email', required: true, defaultValue: landingDefaults.contactEmail }] },
      { label: 'Hero', fields: [text('heroTitle', 'Heading (one line per row)', true), text('heroDescription', 'Description', true), text('heroButton', 'Button label'), text('heroNote', 'Supporting note')] },
      { label: 'Concept', fields: [text('conceptTitle', 'Heading', true), text('conceptDescription', 'Description', true), { name: 'useCases', type: 'array', required: true, minRows: 1, maxRows: 6, defaultValue: landingDefaults.useCases, fields: [{ name: 'title', type: 'text', required: true }, { name: 'description', type: 'textarea', required: true }] }] },
      { label: 'About', fields: [text('aboutTitle', 'Heading', true), text('aboutDescription', 'Description', true)] },
      { label: 'FAQ', fields: [text('faqTitle', 'Heading', true), { name: 'faqs', type: 'array', required: true, minRows: 1, maxRows: 20, defaultValue: faqs, fields: [{ name: 'question', type: 'text', required: true }, { name: 'answer', type: 'textarea', required: true }] }] },
      { label: 'Outlook & closing', fields: [text('outlookTitle', 'Outlook heading'), text('outlookDescription', 'Outlook description', true), text('closingTitle', 'Closing heading', true), text('closingButton', 'Button label')] },
    ] },
  ],
};
