import type { Block, Field } from 'payload'

import {
  FixedToolbarFeature,
  HeadingFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

import { link } from '../../fields/link'

const columnFields: Field[] = [
  {
    name: 'size',
    type: 'select',
    label: 'Breite',
    defaultValue: 'half',
    options: [
      { label: 'Ein Drittel', value: 'oneThird' },
      { label: 'Hälfte', value: 'half' },
      { label: 'Zwei Drittel', value: 'twoThirds' },
      { label: 'Volle Breite', value: 'full' },
    ],
  },
  {
    name: 'richText',
    type: 'richText',
    editor: lexicalEditor({
      features: ({ rootFeatures }) => {
        return [
          ...rootFeatures,
          HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
          FixedToolbarFeature(),
          InlineToolbarFeature(),
        ]
      },
    }),
    label: false,
  },
  {
    name: 'enableLink',
    type: 'checkbox',
    label: 'Link anzeigen',
  },
  link({
    overrides: {
      admin: {
        condition: (_data, siblingData) => {
          return Boolean(siblingData?.enableLink)
        },
      },
    },
  }),
]

export const Content: Block = {
  slug: 'content',
  interfaceName: 'ContentBlock',
  labels: { singular: 'Text', plural: 'Texte' },
  fields: [
    {
      name: 'columns',
      type: 'array',
      label: 'Spalten',
      labels: { singular: 'Spalte', plural: 'Spalten' },
      admin: {
        initCollapsed: true,
      },
      fields: columnFields,
    },
  ],
}
