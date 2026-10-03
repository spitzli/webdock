import type { Block } from 'payload'

export const Team: Block = {
  slug: 'team',
  interfaceName: 'TeamBlock',
  labels: { singular: 'Team', plural: 'Team' },
  fields: [
    { name: 'heading', type: 'text', label: 'Überschrift', required: true },
    { name: 'intro', type: 'textarea', label: 'Einleitung' },
    {
      name: 'members',
      type: 'array',
      label: 'Personen',
      labels: { singular: 'Person', plural: 'Personen' },
      minRows: 1,
      fields: [
        { name: 'photo', type: 'upload', label: 'Foto', relationTo: 'media' },
        {
          type: 'row',
          fields: [
            { name: 'name', type: 'text', label: 'Name', required: true },
            { name: 'role', type: 'text', label: 'Rolle', admin: { placeholder: 'Betriebsleitung' } },
          ],
        },
        { name: 'text', type: 'textarea', label: 'Text' },
      ],
    },
  ],
}
