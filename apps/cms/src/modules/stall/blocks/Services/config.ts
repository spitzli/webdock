import type { Block } from 'payload'

export const Services: Block = {
  slug: 'services',
  interfaceName: 'ServicesBlock',
  labels: { singular: 'Angebot', plural: 'Angebote' },
  fields: [
    { name: 'heading', type: 'text', label: 'Überschrift', required: true },
    { name: 'intro', type: 'textarea', label: 'Einleitung' },
    {
      name: 'items',
      type: 'array',
      label: 'Positionen',
      labels: { singular: 'Position', plural: 'Positionen' },
      minRows: 1,
      fields: [
        { name: 'title', type: 'text', label: 'Titel', required: true },
        { name: 'text', type: 'textarea', label: 'Beschreibung', required: true },
        { name: 'price', type: 'text', label: 'Preis', admin: { placeholder: 'ab 450 € / Monat' } },
      ],
    },
  ],
}
