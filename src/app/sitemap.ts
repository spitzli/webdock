import type { MetadataRoute } from 'next';
export default function sitemap(): MetadataRoute.Sitemap { return [{ url: 'https://webdock.dev', changeFrequency: 'monthly', priority: 1 }]; }
