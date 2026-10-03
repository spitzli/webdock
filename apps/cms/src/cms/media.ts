import crypto from 'node:crypto';
import path from 'node:path';
import { APIError, type CollectionConfig } from 'payload';
import { moduleAccess, siteFields, validateSite } from './site-access';

export const Media: CollectionConfig = {
  slug: 'media', versions: false,
  access: { read: moduleAccess('media'), create: moduleAccess('media', true), update: moduleAccess('media', true), delete: moduleAccess('media', true) },
  hooks: {
    beforeOperation: [({ req }) => { if (req.file) req.file.name = `${crypto.randomUUID()}-${path.basename(req.file.name)}`; }],
    beforeValidate: [validateSite('media'), ({ data, originalDoc, req }) => {
      if (!data) return data;
      if (req.file) {
        if (!req.context.migration && data.rightsConfirmed !== true) throw new APIError('Confirm permission to publish this file.', 400);
        data.prefix = `site-${data.site || originalDoc?.site}`;
      } else if (originalDoc) {
        for (const key of ['filename','prefix','_objectKey','sizes','url','mimeType','filesize','width','height']) {
          if (key in data && JSON.stringify(data[key]) !== JSON.stringify(originalDoc[key])) throw new APIError('Storage metadata cannot be edited directly.', 400);
        }
      }
      return data;
    }],
  },
  upload: {
    mimeTypes: ['image/jpeg','image/png','image/webp','image/avif','image/gif'],
    adminThumbnail: 'thumbnail', focalPoint: true,
    imageSizes: [
      { name:'thumbnail',width:300 }, { name:'square',width:500,height:500 },
      { name:'small',width:600 }, { name:'medium',width:900 }, { name:'large',width:1400 },
      { name:'xlarge',width:1920 }, { name:'og',width:1200,height:630 },
      { name:'card',width:1000,height:625,fit:'inside',withoutEnlargement:true },
    ],
  },
  fields: [...siteFields('media'),
    {name:'alt',type:'text',localized:true,required:true},
    {name:'caption',type:'richText'},
    {name:'rightsConfirmed',type:'checkbox',label:'I have permission to publish this file.'},
  ],
};
