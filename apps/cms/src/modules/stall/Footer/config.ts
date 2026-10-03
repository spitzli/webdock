import type { GlobalConfig } from 'payload'

import { link } from '../fields/link'

export const Footer: GlobalConfig = {
  slug: 'footer',
  label: 'Footer',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'navItems',
      type: 'array',
      label: 'Links (z. B. Impressum, Datenschutz)',
      labels: { singular: 'Link', plural: 'Links' },
      fields: [
        link({
          appearances: false,
        }),
      ],
      maxRows: 6,
    },
  ],
}
