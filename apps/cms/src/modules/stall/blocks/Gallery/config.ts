import type { Block } from 'payload'

export const Gallery: Block = {
  slug: 'gallery',
  interfaceName: 'GalleryBlock',
  labels: { singular: 'Galerie', plural: 'Galerien' },
  fields: [
    { name: 'heading', type: 'text', label: 'Überschrift' },
    {
      name: 'images',
      type: 'upload',
      label: 'Bilder',
      relationTo: 'media',
      hasMany: true,
      required: true,
    },
  ],
}
