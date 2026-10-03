import type { Block } from 'payload'

export const Facilities: Block = {
  slug: 'facilities',
  interfaceName: 'FacilitiesBlock',
  labels: { singular: 'Anlage (Fakten)', plural: 'Anlage (Fakten)' },
  fields: [
    { name: 'heading', type: 'text', label: 'Überschrift', required: true },
    { name: 'intro', type: 'textarea', label: 'Einleitung' },
    {
      name: 'items',
      type: 'array',
      label: 'Fakten',
      labels: { singular: 'Fakt', plural: 'Fakten' },
      minRows: 1,
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'label', type: 'text', label: 'Bezeichnung', required: true, admin: { placeholder: 'Reithalle' } },
            { name: 'value', type: 'text', label: 'Wert', required: true, admin: { placeholder: '20 × 40 m' } },
          ],
        },
      ],
    },
  ],
}
