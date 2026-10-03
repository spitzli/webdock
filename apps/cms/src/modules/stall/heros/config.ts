import type { Field } from 'payload'

import { linkGroup } from '../fields/linkGroup'

export const hero: Field = {
  name: 'hero',
  type: 'group',
  label: false,
  fields: [
    {
      name: 'type',
      type: 'select',
      label: 'Art',
      defaultValue: 'text',
      required: true,
      options: [
        { label: 'Bild mit Titel', value: 'image' },
        { label: 'Nur Titel', value: 'text' },
        { label: 'Kein Hero', value: 'none' },
      ],
    },
    {
      name: 'title',
      type: 'text',
      label: 'Titel',
      admin: { condition: (_, { type } = {}) => type !== 'none' },
    },
    {
      name: 'text',
      type: 'textarea',
      label: 'Einleitung',
      admin: { condition: (_, { type } = {}) => type !== 'none' },
    },
    linkGroup({
      overrides: {
        maxRows: 2,
        admin: { condition: (_, { type } = {}) => type !== 'none' },
      },
    }),
    {
      name: 'media',
      type: 'upload',
      label: 'Bild',
      relationTo: 'media',
      required: true,
      admin: { condition: (_, { type } = {}) => type === 'image' },
    },
  ],
}
