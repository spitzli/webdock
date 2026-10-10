'use client';
import {useOramaRows} from '@webdock/search/react';
import {msgid} from '@webdock/i18n';
import { useI18n } from '@webdock/i18n/react';

/* eslint-disable @next/next/no-img-element -- These previews load customer-provided HTTPS image addresses directly. */

import { useActionState, useEffect, useRef, useState } from 'react';
import type { WebsiteContentField } from '@/lib/demo-content';
import { updateWebsiteContent, type ContentActionState } from './actions';
import { contentImageURL, initialContentDraft, savedContentDraft, restoreContentDrafts, type ContentDraft } from './content-state';

type Filter = 'all' | 'text' | 'image';
export function ContentWorkspace({ bindingID, fields, variant, writable, origin }: {
  bindingID: string; fields: WebsiteContentField[]; variant: 'modern' | 'old'; writable: boolean; origin: string;
}) {
  const i18n = useI18n();

  const [selected, setSelected] = useState(fields[0]?.key || '');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, ContentDraft>>(() => Object.fromEntries(fields.map(field => [field.key, initialContentDraft(field)])));
  const editor = useRef<HTMLElement>(null);
  const storageKey = `webdock-content:${bindingID}:${variant}`;
  const storageReady = useRef(false);
  useEffect(() => {
    if (!writable) return;
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore tab-local drafts after hydration; no browser storage is accessed during SSR.
        setDrafts(current => restoreContentDrafts(current, parsed));
      }
    } catch { /* The navigation guard still protects changes when storage is unavailable. */ }
  }, [storageKey, writable]);
  useEffect(() => {
    if (!writable) return;
    if (!storageReady.current) { storageReady.current = true; return; }
    try {
      const unsaved = Object.fromEntries(Object.entries(drafts).filter(([, draft]) => draft.value !== draft.savedValue));
      if (Object.keys(unsaved).length) sessionStorage.setItem(storageKey, JSON.stringify(unsaved));
      else sessionStorage.removeItem(storageKey);
    } catch { /* Storage may be disabled or full; keep the in-memory drafts and navigation guard. */ }
  }, [drafts, storageKey, writable]);
  const dirtyCount = Object.values(drafts).filter(draft => draft.value !== draft.savedValue).length;
  const matches=useOramaRows(fields,query,field=>`${field.label} ${drafts[field.key].savedValue}`);
  const visible=matches.filter(field=>filter==='all'||field.kind===filter);
  const active = visible.find(field => field.key === selected) || visible[0];

  // Field switching keeps all drafts. Leaving this editor requires explicit consent.
  useEffect(() => {
    if (!dirtyCount) return;
    let leaving = false;
    const unload = (event: BeforeUnloadEvent) => { if (!leaving) { event.preventDefault(); event.returnValue = ''; } };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download')) return;
      const url = new URL(link.href);
      if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search) return;
      if (!window.confirm(i18n.t("Unsaved changes have not been published. Leave this page anyway?"))) {
        event.preventDefault(); event.stopPropagation();
      } else leaving = true;
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true); };
  }, [dirtyCount,i18n]);

  function selectField(key: string) {
    setSelected(key);
    if (window.matchMedia('(max-width: 760px)').matches) {
      editor.current?.focus({ preventScroll: true });
      editor.current?.scrollIntoView({ block: 'start' });
    }
  }
  return <div className="content-workspace">
    <div className="content-topline">
      <nav className="content-segment" aria-label={i18n.t("Website view")}>
        <a href="?variant=modern" aria-current={variant === 'modern' ? 'page' : undefined}>{i18n.t("New design")}</a>
        <a href="?variant=old" aria-current={variant === 'old' ? 'page' : undefined}>{i18n.t("Original view")}</a>
      </nav>
      <div className="content-session-status" role="status">{dirtyCount ? i18n.n("{count} unsaved field", "{count} unsaved fields", dirtyCount) : writable ? i18n.t("Saving publishes your changes") : i18n.t("Read access")}</div>
    </div>
    {!fields.length ? <section className="cms-panel content-empty"><h2>{i18n.t("No content yet")}</h2><p>{i18n.t("No editable fields have been configured for this view.")}</p></section> : <div className="content-editor-layout">
      <aside className="content-browser cms-panel" aria-label={i18n.t("Content fields")}>
        <div className="content-browser-tools">
          <label className="content-search">{i18n.t("Search content")}<input type="search" placeholder={i18n.t("Search text or label")} value={query} onChange={event => setQuery(event.target.value)} disabled={saving} /></label>
          <div className="content-type-filter" role="group" aria-label={i18n.t("Content type")}>
            {([["all", msgid("All")], ["text", msgid("Texts")], ["image", msgid("Images")]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} disabled={saving}>{i18n.t(label)}<span>{value === 'all' ? fields.length : fields.filter(field => field.kind === value).length}</span></button>)}
          </div>
        </div>
        <div className="content-list-heading"><span>{i18n.n("{count} field", "{count} fields", visible.length)}</span><span>{i18n.t("Select content")}</span></div>
        <ul className="content-field-list">{visible.map(field => {
          const draft = drafts[field.key];
          return <li key={field.key}><button type="button" className="content-field-item" aria-current={active?.key === field.key ? 'true' : undefined} aria-controls="content-selected-editor" disabled={saving} onClick={() => selectField(field.key)}>
            <span className="content-field-icon" aria-hidden="true">{field.kind === 'image' ? <svg viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="2"/><circle cx="7" cy="7" r="1"/><path d="m3 14 4-4 3 3 3-5 4 6"/></svg> : i18n.t("T")}</span>
            <span className="content-field-copy"><strong>{field.label}</strong>{(field.kind === 'image' || draft.value.trim() !== field.label.trim()) && <span>{field.kind === 'image' ? i18n.t("Image URL") : draft.value || i18n.t("Empty text field")}</span>}</span>
            {draft.value !== draft.savedValue && <span className="content-draft-marker" title={i18n.t("Unsaved")} aria-label={i18n.t("Unsaved")} />}
          </button></li>;
        })}</ul>
        {!visible.length && <div className="content-no-results"><p>{i18n.t("No matching content.")}</p><button type="button" className="text-button" onClick={() => { setQuery(''); setFilter('all'); }}>{i18n.t("Reset filters")}</button></div>}
      </aside>
      <section className="content-editor-panel cms-panel" id="content-selected-editor" ref={editor} tabIndex={-1} aria-label={i18n.t("Selected content")}>
        {active ? <ContentEditor key={active.key} bindingID={bindingID} field={active} draft={drafts[active.key]} writable={writable} origin={origin}
          onChange={value => setDrafts(current => ({ ...current, [active.key]: { ...current[active.key], value } }))}
          onSaved={(value, updatedAt) => setDrafts(current => ({ ...current, [active.key]: savedContentDraft(current[active.key], value, updatedAt) }))}
          onReset={() => setDrafts(current => { const draft = current[active.key]; return { ...current, [active.key]: { ...draft, value: draft.savedValue, updatedAt: active.value === draft.savedValue ? active.updatedAt : draft.updatedAt } }; })}
          onSaving={setSaving} /> : <div className="content-empty"><h2>{i18n.t("Select content")}</h2><p>{i18n.t("Change your search to open a field.")}</p></div>}
      </section>
    </div>}
  </div>;
}

function ContentEditor({ bindingID, field, draft, writable, origin, onChange, onSaved, onReset, onSaving }: {
  bindingID: string; field: WebsiteContentField; draft: ContentDraft; writable: boolean; origin: string;
  onChange: (value: string) => void; onSaved: (value: string, updatedAt: string) => void; onReset: () => void; onSaving: (saving: boolean) => void;
}) {
  const i18n = useI18n();

  const dirty = draft.value !== draft.savedValue;
  const [state, action, pending] = useActionState(async (previous: ContentActionState, form: FormData) => {
    onSaving(true);
    try {
      const result = await updateWebsiteContent(previous, form);
      if (result.updatedAt) onSaved(String(form.get('value')), result.updatedAt);
      return result;
    } finally { onSaving(false); }
  }, {});
  return <>
    <header className="content-editor-heading"><span className="content-field-type">{field.kind === 'image' ? i18n.t("Image") : i18n.t("Text")}</span><h2>{field.label}</h2><p>{i18n.t("Last saved ")}{new Date(draft.updatedAt).toLocaleString(i18n.locale === "de" ? "de-DE" : "en-GB", { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p></header>
    <form action={action} className="content-edit-form" aria-busy={pending}>
      <input type="hidden" name="bindingID" value={bindingID} /><input type="hidden" name="variant" value={field.variant} /><input type="hidden" name="key" value={field.key} /><input type="hidden" name="updatedAt" value={draft.updatedAt} />
      <div className="content-edit-body">
        {field.kind === 'image' && <ContentImagePreview value={draft.value} origin={origin} />}
        <label className="content-value-label" htmlFor="content-field-value">{field.kind === 'image' ? i18n.t("Image URL") : i18n.t("Content")}</label>
        {field.kind === 'image' ? <input id="content-field-value" type="text" name="value" value={draft.value} onChange={event => onChange(event.target.value)} maxLength={2000} required spellCheck={false} readOnly={!writable} disabled={pending} /> : <textarea id="content-field-value" name="value" value={draft.value} onChange={event => onChange(event.target.value)} maxLength={6000} rows={9} readOnly={!writable} disabled={pending} />}
        <div className="content-field-help"><span>{field.kind === 'image' ? i18n.t("Local image path or HTTPS URL. This does not upload a file.") : i18n.t("Line breaks are preserved. Text segments are edited individually.")}</span>{field.kind === 'text' && <span>{draft.value.length} / 6000</span>}</div>
        {state.error && <p className="content-feedback content-feedback-error" role="alert">{i18n.error(state.error)} <a href={`?variant=${field.variant}`}>{i18n.t("Load current content")}</a></p>}
        {!dirty && state.message && <p className="content-feedback" role="status">{i18n.t("Saved. The website displays the updated content.")}</p>}
      </div>
      <footer className="cms-savebar content-savebar"><span>{pending ? i18n.t("Saving change…") : dirty ? i18n.t("Unsaved change") : writable ? i18n.t("All changes saved") : i18n.t("This field is read-only")}</span>{writable && <div className="content-save-actions">{dirty && <button type="button" className="text-button" disabled={pending} onClick={() => { if (window.confirm(i18n.t("Discard changes to this field?"))) onReset(); }}>{i18n.t("Reset")}</button>}<button type="submit" className="button" disabled={pending || !dirty}>{pending ? i18n.t("Saving…") : i18n.t("Save change")}</button></div>}</footer>
    </form>
  </>;
}

function ContentImagePreview({ value, origin }: { value: string; origin: string }) {
  const i18n = useI18n();

  const url = contentImageURL(value, origin);
  const [failedURL, setFailedURL] = useState<string | null>(null);
  return <figure className="content-image-preview">{url && failedURL !== url ? <img src={url} alt={i18n.t("Preview of the selected website image")} onError={() => setFailedURL(url)} referrerPolicy="no-referrer" /> : <div className="content-image-placeholder"><strong>{url ? i18n.t("Image unavailable") : i18n.t("No image preview")}</strong><span>{url ? i18n.t("Check the image URL and whether the file is available.") : i18n.t("Enter a local path or a valid HTTPS image URL.")}</span></div>}<figcaption>{i18n.t("Image preview")}</figcaption></figure>;
}
