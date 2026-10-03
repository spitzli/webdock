import type { GlobalConfig } from 'payload'

import { link } from '../fields/link'

export const Header: GlobalConfig = {
  slug: 'header',
  label: 'Navigation',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'navItems',
      type: 'array',
      label: 'Menüpunkte',
      labels: { singular: 'Menüpunkt', plural: 'Menüpunkte' },
      fields: [
        link({
          appearances: false,
        }),
      ],
      maxRows: 6,
    },
  ],
}
