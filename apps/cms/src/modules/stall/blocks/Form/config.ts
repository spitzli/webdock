import type { Block } from 'payload'

export const FormBlock: Block = {
  slug: 'formBlock',
  interfaceName: 'FormBlock',
  labels: { singular: 'Formular', plural: 'Formulare' },
  fields: [
    {
      name: 'form',
      type: 'relationship',
      label: 'Formular',
      relationTo: 'stall-forms',
      required: true,
    },
    { name: 'heading', type: 'text', label: 'Überschrift' },
    { name: 'intro', type: 'textarea', label: 'Einleitung' },
  ],
  graphQL: {
    singularName: 'FormBlock',
  },
}
