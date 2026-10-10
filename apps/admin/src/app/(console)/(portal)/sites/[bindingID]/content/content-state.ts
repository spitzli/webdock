import type { WebsiteContentField } from '@/lib/demo-content';

export type ContentDraft = { value: string; savedValue: string; updatedAt: string };
export function initialContentDraft(field: WebsiteContentField): ContentDraft {
  return { value: field.value, savedValue: field.value, updatedAt: field.updatedAt };
}
export function savedContentDraft(draft: ContentDraft, submittedValue: string, updatedAt: string): ContentDraft {
  return { ...draft, savedValue: submittedValue, updatedAt };
}
export function contentImageURL(value: string, origin: string): string | null {
  if (!value || /[\s\\]/.test(value)) return null;
  try {
    const url = new URL(value, origin);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (value.startsWith('/')) {
      if (value.startsWith('//') || url.origin !== origin) return null;
      return url.href;
    }
    return /^https:\/\//i.test(value) ? url.href : null;
  } catch { return null; }
}

export function restoreContentDrafts(current: Record<string, ContentDraft>, stored: unknown): Record<string, ContentDraft> {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return current;
  const restored = { ...current };
  for (const [key, draft] of Object.entries(current)) {
    const value = (stored as Record<string, unknown>)[key];
    if (!value || typeof value !== 'object') continue;
    const entry = value as Partial<ContentDraft>;
    if (typeof entry.value !== 'string' || entry.value.length > 6000 || typeof entry.updatedAt !== 'string' || !Number.isFinite(Date.parse(entry.updatedAt)) || entry.value === draft.savedValue) continue;
    // Keep the original timestamp: a server-side edit must still produce a conflict.
    restored[key] = { ...draft, value: entry.value, updatedAt: entry.updatedAt };
  }
  return restored;
}
