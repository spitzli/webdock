import type { Block } from 'payload'

export const MediaBlock: Block = {
  slug: 'mediaBlock',
  interfaceName: 'MediaBlock',
  labels: { singular: 'Bild', plural: 'Bilder' },
  fields: [
    {
      name: 'media',
      type: 'upload',
      label: 'Bild',
      relationTo: 'media',
      required: true,
    },
  ],
}
