import {msgid} from '@webdock/i18n';
import type { Field, GlobalConfig } from 'payload';
import { faqs } from '../lib/content';
import { authenticated } from './access';

export const landingDefaults = {
  seoTitle: msgid("Webdock — Project previews & client websites by Spitzli"),
  seoDescription: msgid("Your project. Well docked. A home for project previews and client websites by Spitzli Development — on a Webdock subdomain or your own domain."),
  contactEmail: 'dominik@spitzli.dev',
  heroTitle: msgid("Your project.\nWell docked."),
  heroDescription: msgid("From the first preview to the finished website. Webdock gives your project a place to call home."),
  heroButton: msgid("Let’s get you docked"),
  heroNote: msgid("Your subdomain. Or your own domain."),
  conceptTitle: msgid("From “take a look”\nto “we’re live”."),
  conceptDescription: msgid("Some projects need a link to get started. Others need a lasting home. Webdock is here for both."),
  useCases: [
    { title: msgid("Share it before you ship it."), description: msgid("A dedicated address for your work in progress. Review it together, share feedback and make the next version better.") },
    { title: msgid("Your website. Your place."), description: msgid("No domain of your own? Your project can live on a Webdock subdomain. Easy to share, easy to find again.") },
    { title: msgid("Ready for what comes next."), description: msgid("When you’re ready for your own domain, we’ll work out the connection. The setup grows with your project.") },
  ],
  aboutTitle: msgid("A home online.\nA human on your side."),
  aboutDescription: msgid("Webdock is run by Dominik at Spitzli Development. From the first idea to deployment, you work directly with the person building your project."),
  faqTitle: msgid("Good questions.\nStraight answers."),
  faqs,
  outlookTitle: msgid("Your projects. One workspace."),
  outlookDescription: msgid("Webdock Studio brings websites, content, appointments and design together. Access is by invitation."),
  closingTitle: msgid("There’s a place\nfor your next idea."),
  closingButton: msgid("Let’s talk about it"),
};

const text = (name: Exclude<keyof typeof landingDefaults, 'faqs' | 'useCases'>, label: string, multiline = false): Field => {
  const base = { name, label, required: true, defaultValue: landingDefaults[name] };
  return multiline ? { ...base, type: 'textarea' } : { ...base, type: 'text' };
};

export const LandingPage: GlobalConfig = {
  slug: 'landing-page', label: msgid("Landing page"),
  access: { read: authenticated, update: authenticated },
  fields: [
    { type: 'tabs', tabs: [
      { label: msgid("SEO & contact"), fields: [text('seoTitle', msgid("Page title")), text('seoDescription', msgid("Description"), true), { name: 'contactEmail', type: 'email', required: true, defaultValue: landingDefaults.contactEmail }] },
      { label: msgid("Hero"), fields: [text('heroTitle', msgid("Heading (one line per row)"), true), text('heroDescription', msgid("Description"), true), text('heroButton', msgid("Button label")), text('heroNote', msgid("Supporting note"))] },
      { label: msgid("Concept"), fields: [text('conceptTitle', msgid("Heading"), true), text('conceptDescription', msgid("Description"), true), { name: 'useCases', type: 'array', required: true, minRows: 1, maxRows: 6, defaultValue: landingDefaults.useCases, fields: [{ name: 'title', type: 'text', required: true }, { name: 'description', type: 'textarea', required: true }] }] },
      { label: msgid("About"), fields: [text('aboutTitle', msgid("Heading"), true), text('aboutDescription', msgid("Description"), true)] },
      { label: msgid("FAQ"), fields: [text('faqTitle', msgid("Heading"), true), { name: 'faqs', type: 'array', required: true, minRows: 1, maxRows: 20, defaultValue: faqs, fields: [{ name: 'question', type: 'text', required: true }, { name: 'answer', type: 'textarea', required: true }] }] },
      { label: msgid("Outlook & closing"), fields: [text('outlookTitle', msgid("Outlook heading")), text('outlookDescription', msgid("Outlook description"), true), text('closingTitle', msgid("Closing heading"), true), text('closingButton', msgid("Button label"))] },
    ] },
  ],
};
