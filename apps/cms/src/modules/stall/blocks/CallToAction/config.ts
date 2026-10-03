import type { Block } from 'payload'

import { linkGroup } from '../../fields/linkGroup'

export const CallToAction: Block = {
  slug: 'cta',
  interfaceName: 'CallToActionBlock',
  labels: { singular: 'Aufruf (CTA)', plural: 'Aufrufe (CTA)' },
  fields: [
    { name: 'heading', type: 'text', label: 'Überschrift', required: true },
    { name: 'text', type: 'textarea', label: 'Text' },
    linkGroup({
      appearances: ['default', 'outline'],
      overrides: { maxRows: 2 },
    }),
  ],
}
