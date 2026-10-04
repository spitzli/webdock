import type { MetadataRoute } from 'next';
export default function sitemap(): MetadataRoute.Sitemap { return ['', '/terms', '/privacy'].map(path => ({ url: `https://webdock.dev${path}`, changeFrequency: 'monthly', priority: path ? 0.3 : 1 })); }
