import { getPayload } from 'payload';
import config from '../src/payload.config';
import { landingDefaults } from '../src/cms/landing';

const payload = await getPayload({ config });
try {
  const users = await payload.count({ collection: 'users', overrideAccess: true });
  if (users.totalDocs === 0) {
    if (!process.env.BOOTSTRAP_EMAIL || !process.env.BOOTSTRAP_PASSWORD) throw new Error('Bootstrap credentials are required.');
    await payload.create({ collection: 'users', overrideAccess: true, data: { email: process.env.BOOTSTRAP_EMAIL, password: process.env.BOOTSTRAP_PASSWORD, name: 'Dominik' } });
    console.log('Initial admin created. Credentials are in the local .env.bootstrap file.');
  }
  const landing = await payload.findGlobal({ slug: 'landing-page', overrideAccess: true });
  if (!landing.updatedAt) {
    await payload.updateGlobal({ slug: 'landing-page', overrideAccess: true, data: landingDefaults });
    console.log('Seeded the existing English landing page.');
  }
} finally { await payload.destroy(); }
