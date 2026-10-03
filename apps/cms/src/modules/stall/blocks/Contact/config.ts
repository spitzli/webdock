import type { Block } from 'payload'

export const Contact: Block = {
  slug: 'contact',
  interfaceName: 'ContactBlock',
  labels: { singular: 'Kontakt & Stallzeiten', plural: 'Kontakt & Stallzeiten' },
  fields: [
    { name: 'heading', type: 'text', label: 'Überschrift', defaultValue: 'Kontakt' },
    {
      name: 'text',
      type: 'textarea',
      label: 'Text',
      admin: { description: 'Adresse, Telefon und Stallzeiten werden aus «Betrieb» übernommen.' },
    },
  ],
}
