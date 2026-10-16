'use client';
import { msgid } from '@webdock/i18n';

import { useI18n } from '@webdock/i18n/react';

import { useEffect, useRef, useState, type KeyboardEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createCanvasDocument, createCanvasNode, parseCanvasDocument, type Breakpoint, type CanvasDocument, type CanvasList, type CanvasNode, type CanvasPage, type NodeType } from '@webdock/page-builder/model';
import { renderCanvasHTML } from '@webdock/page-builder/render';
import { canvasCommand, type CanvasCommand } from '@/app/(console)/(portal)/sites/[bindingID]/builder/actions';
import { CanvasStage } from './stage';
import { CanvasInspector } from './inspector';
import { initialHistory, commitHistory, undoHistory, redoHistory, sameDocument, reorderNode, pointerFrame, setNodeFrame } from './history';
import './canvas.css';

const breakpointNames: Record<Breakpoint, string> = { desktop: msgid("Desktop"), tablet: msgid("Tablet"), mobile: msgid("Mobile") };
const nodeNames: Record<NodeType, string> = { text: msgid("Text"), image: msgid("Image"), box: msgid("Box"), button: msgid("Button") };

export function CanvasEditor({ bindingID, initialList, initialPage, origin, readOnly, canSetHomepage }: {
  bindingID: string; initialList: CanvasList; initialPage: CanvasPage | null; origin: string; readOnly: boolean; canSetHomepage: boolean;
}) {
  const i18n = useI18n();

  const router = useRouter();
  // A revalidation must not replace local edits or silently advance expectedRevision.
  const [page, setPage] = useState(initialPage);
  const [savedRevision, setSavedRevision] = useState(initialPage?.draftRevision || 1);
  const [savedDocument, setSavedDocument] = useState(() => initialPage?.draft || createCanvasDocument());
  const [history, setHistory] = useState(() => initialHistory(initialPage?.draft || createCanvasDocument()));
  const [homePageID, setHomePageID] = useState(initialList.homePageID);
  const [selected, setSelected] = useState<string | null>(null);
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('desktop');
  const [zoom, setZoom] = useState(.5);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(!initialPage);
  const [newTitle, setNewTitle] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const document = history.present;
  const node = document.nodes.find(item => item.id === selected);
  const dirty = Boolean(page && !sameDocument(document, savedDocument));
  const locked = readOnly || busy;
  const storageKey = `webdock-canvas:${bindingID}:${page?.id || 'new'}`;
  const recovered = useRef(false);

  useEffect(() => {
    if (readOnly || !initialPage || recovered.current) return;
    recovered.current = true;
    try {
      const value = sessionStorage.getItem(storageKey);
      if (!value) return;
      const stored = JSON.parse(value) as { document?: unknown; revision?: number };
      const restored = parseCanvasDocument(stored.document);
      if (sameDocument(restored, initialPage.draft)) return;
      // Preserve the original save revision so restoring never bypasses a conflict.
      if (!Number.isInteger(stored.revision) || Number(stored.revision) < 1) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Browser-only draft recovery after hydration.
      setHistory(initialHistory(restored));
      setPage(current => current ? { ...current, draftRevision: stored.revision! } : current);
      setMessage(msgid("Local changes from this tab restored."));
    } catch { /* Keep invalid or unreadable local storage untouched; server data remains available. */ }
  }, [initialPage, readOnly, storageKey]);
  useEffect(() => {
    if (readOnly || !page) return;
    try { if (dirty) sessionStorage.setItem(storageKey, JSON.stringify({ document, revision: page.draftRevision })); else sessionStorage.removeItem(storageKey); } catch { /* Navigation protection also works without browser storage. */ }
  }, [dirty, document, page, readOnly, storageKey]);
  useEffect(() => {
    if (!dirty && !busy) return;
    let approved = false;
    const unload = (event: BeforeUnloadEvent) => { if (busy || !approved) { event.preventDefault(); event.returnValue = ''; } };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download')) return;
      if (busy) { event.preventDefault(); event.stopPropagation(); setMessage(msgid("Please wait until the current action is complete.")); return; }
      const target = new URL(link.href);
      if (target.pathname === location.pathname && target.search === location.search && target.origin === location.origin) return;
      if (!window.confirm(i18n.t("There are unsaved changes. Leave this page anyway?"))) { event.preventDefault(); event.stopPropagation(); } else approved = true;
    };
    window.addEventListener('beforeunload', unload); window.document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', unload); window.document.removeEventListener('click', navigate, true); };
  }, [dirty, busy,i18n]);

  function change(next: CanvasDocument) {
    if (locked) return;
    setHistory(current => commitHistory(current, next)); setMessage(''); setError('');
  }
  function add(type: NodeType) {
    if (locked || document.nodes.length >= 100) return;
    const next = createCanvasNode(type);
    next.name = nodeNames[type]; if (type === 'text') next.text = 'Your text';
    change({ ...document, nodes: [...document.nodes, next] }); setSelected(next.id); setPreview(false);
  }
  function remove() {
    if (!node || locked) return;
    change({ ...document, nodes: document.nodes.filter(item => item.id !== node.id) }); setSelected(null);
  }
  function duplicate() {
    if (!node || locked || document.nodes.length >= 100) return;
    const clone: CanvasNode = { ...structuredClone(node), id: createCanvasNode(node.type).id, name: `${node.name} copy`.slice(0, 200) };
    for (const size of ['desktop', 'tablet', 'mobile'] as const) clone.frames[size] = pointerFrame(clone.frames[size], 16, 16, 1);
    change({ ...document, nodes: [...document.nodes, clone] }); setSelected(clone.id);
  }
  function keyboard(event: KeyboardEvent) {
    if (event.target instanceof HTMLElement && (event.target.matches('input,textarea,select') || event.target.isContentEditable)) return;
    if (event.key === 'Escape') { setSelected(null); return; }
    if (locked || preview) return;
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === 'z') { event.preventDefault(); setHistory(current => event.shiftKey ? redoHistory(current) : undoHistory(current)); return; }
    if (modifier && event.key.toLowerCase() === 'y') { event.preventDefault(); setHistory(redoHistory); return; }
    if (modifier && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicate(); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove(); return; }
    if (!node || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); const step = event.shiftKey ? 10 : 1;
    change(setNodeFrame(document, node.id, breakpoint, pointerFrame(node.frames[breakpoint], event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0, 1)));
  }
  async function run(command: CanvasCommand) {
    if (locked) return null;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await canvasCommand(bindingID, command);
      if (!result.ok) { setError(result.error); return null; }
      if (result.page && command.action !== 'create') { setPage(result.page); setSavedDocument(result.page.draft); setSavedRevision(result.page.draftRevision); }
      if ('homePageID' in result) setHomePageID(result.homePageID ?? null);
      return result;
    } catch { setError(msgid("Could not save the change. Your draft is preserved.")); return null; }
    finally { setBusy(false); }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (dirty && !window.confirm(i18n.t("Your changes have not been saved. Create another page anyway?"))) return;
    let newDocument: CanvasDocument;
    try { newDocument = createCanvasDocument(newTitle.trim(), newSlug.trim()); } catch { setError(msgid("Enter a page title and an address using lowercase letters, digits or hyphens.")); return; }
    const result = await run({ action: 'create', document: newDocument });
    if (result?.page) router.replace(`/sites/${bindingID}/builder?page=${result.page.id}`);
  }
  async function save() {
    if (!page || !dirty) return;
    try { parseCanvasDocument(document); } catch (cause) { setError(cause instanceof Error ? cause.message : msgid("Please check the page properties.")); return; }
    const result = await run({ action: 'save', id: page.id, expectedRevision: page.draftRevision, document });
    if (result?.page) { try { sessionStorage.removeItem(storageKey); } catch {} setMessage(msgid("Draft saved. The published page is unchanged.")); }
  }
  async function publish() {
    if (!page || dirty) return;
    const result = await run({ action: 'publish', id: page.id, expectedRevision: page.draftRevision });
    if (result?.page) setMessage(msgid("Page published."));
  }
  async function unpublish() {
    if (!page || !window.confirm(i18n.t("Unpublish this page? If it is the homepage, the original website will be shown again."))) return;
    const result = await run({ action: 'unpublish', id: page.id, expectedRevision: page.draftRevision });
    if (result?.page) { if (homePageID === page.id) setHomePageID(null); setMessage(msgid("Page unpublished.")); }
  }
  async function homepage(id: number | null) {
    if (!page || !canSetHomepage || !window.confirm(id === null ? i18n.t("Restore the original website as the homepage?") : i18n.t("Use this published page as the homepage? It will replace the current homepage."))) return;
    const result = await run({ action: 'homepage', id, ...(id === null ? {} : { expectedRevision: page.draftRevision }) });
    if (result) setMessage(id === null ? msgid("The original website is the homepage again.") : msgid("This page is now the homepage."));
  }
  const board = document.artboards[breakpoint];
  let previewHTML = '';
  if (preview) { try { previewHTML = renderCanvasHTML(document, { origin, breakpoint, interactive: false }); } catch { /* Keep the invalid draft editable and show an actionable preview state. */ } }
  return <div className="canvas-editor" onKeyDown={keyboard}>
    <header className="cms-page-heading"><div><h1>{i18n.t("Design")}</h1><p>{i18n.t("Position elements freely. Drafts and publication remain separate.")}</p></div><a className="button secondary" href={new URL(initialList.nativePath, origin).href} target="_blank" rel="noopener noreferrer">{i18n.t("Original website ↗")}</a></header>
    <nav className="canvas-pages" aria-label={i18n.t("Design pages")}>{initialList.pages.map(item => <Link key={item.id} href={`?page=${item.id}`} aria-current={page?.id === item.id ? 'page' : undefined}>{item.id === page?.id ? document.title : item.title}{item.id === homePageID && <span>{i18n.t("Homepage")}</span>}</Link>)}{!readOnly && <button type="button" className="button secondary" disabled={busy || initialList.pages.length >= 100} onClick={() => setCreating(value => !value)}>{i18n.t("New page")}</button>}</nav>
    {creating && !readOnly && <form className="canvas-create cms-panel" onSubmit={create}><label>{i18n.t("Page title")}<input required maxLength={120} value={newTitle} disabled={busy} onChange={event => { setNewTitle(event.target.value); if (!slugEdited) setNewSlug(event.target.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64)); }} /></label><label>{i18n.t("Address /p/")}<input required pattern={"[a-z0-9\\-]{1,64}"} maxLength={64} value={newSlug} disabled={busy} onChange={event => { setSlugEdited(true); setNewSlug(event.target.value.toLowerCase()); }} /></label><button className="button" disabled={busy}>{busy ? i18n.t("Creating…") : i18n.t("Create draft")}</button>{page && <button type="button" className="text-button" disabled={busy} onClick={() => setCreating(false)}>{i18n.t("Cancel")}</button>}</form>}
    {error && <p role="alert" className="canvas-feedback canvas-error">{i18n.error(error)}{i18n.t(" Your local changes are preserved.")}</p>}{message && <p role="status" className="canvas-feedback">{i18n.t(message)}</p>}
    {!page ? <section className="cms-panel canvas-empty"><h2>{initialList.pages.length ? i18n.t("Select a page") : i18n.t("No design pages yet")}</h2><p>{readOnly ? i18n.t("View existing pages here.") : i18n.t("Create a draft. The existing website is unchanged.")}</p></section> : <>
      <div className="canvas-toolbar"><div className="canvas-breakpoints" role="group" aria-label={i18n.t("Screen size")}>{(['desktop', 'tablet', 'mobile'] as const).map(size => <button key={size} type="button" disabled={busy} aria-pressed={breakpoint === size} onClick={() => setBreakpoint(size)}>{i18n.t(breakpointNames[size])}</button>)}</div><label className="canvas-zoom">{i18n.t("Zoom")}<select value={zoom} onChange={event => setZoom(Number(event.target.value))}>{[.25, .5, .75, 1].map(value => <option key={value} value={value}>{value * 100}%</option>)}</select></label><button type="button" className="button secondary" onClick={() => setPreview(value => !value)}>{preview ? i18n.t("Back to editor") : i18n.t("Live preview")}</button><div className="canvas-history"><button type="button" disabled={locked || !history.past.length} onClick={() => setHistory(undoHistory)} title={i18n.t("Undo (Ctrl/⌘ Z)")}>↶<span>{i18n.t("Back")}</span></button><button type="button" disabled={locked || !history.future.length} onClick={() => setHistory(redoHistory)} title={i18n.t("Redo (Ctrl/⌘ Shift Z)")}>↷<span>{i18n.t("Redo")}</span></button></div></div>
      {preview ? <section className="canvas-preview" aria-label={i18n.t("Live preview of the current draft")}><div className="canvas-preview-note">{dirty ? i18n.t("Preview with your unsaved changes") : i18n.t("Draft preview")} · {board.width} × {board.height}{i18n.t(" px · Links are disabled in preview")}</div><div className="canvas-preview-scroll"><div style={{ width: board.width * zoom, height: board.height * zoom }}>{previewHTML ? <iframe title={i18n.t("Live preview of the current draft")} sandbox="" referrerPolicy="no-referrer" srcDoc={previewHTML} style={{ width: board.width, height: board.height, transform: `scale(${zoom})`, transformOrigin: 'top left' }} /> : <p className="canvas-preview-validation" role="status">{i18n.t("The preview needs a page title, valid address and complete colour values. Add these in the editor.")}</p>}</div></div></section> : <div className="canvas-workbench">
        <aside className="canvas-layers" aria-label={i18n.t("Layers")}><div className="canvas-sidebar-heading"><h2>{i18n.t("Layers")}</h2><span>{document.nodes.length} / 100</span></div><button type="button" className={`canvas-page-layer${!selected ? ' is-selected' : ''}`} onClick={() => setSelected(null)}>{i18n.t("Page & background")}</button><div className="canvas-add-tools">{(['text', 'image', 'box', 'button'] as const).map(type => <button key={type} type="button" disabled={locked || document.nodes.length >= 100} onClick={() => add(type)}>+ {i18n.t(nodeNames[type])}</button>)}</div><ol className="canvas-layer-list">{[...document.nodes].reverse().map(item => <li key={item.id}><button type="button" disabled={busy} className={selected === item.id ? 'is-selected' : ''} onClick={() => setSelected(item.id)}><span>{item.name || i18n.t(nodeNames[item.type])}</span><small>{item.frames[breakpoint].hidden ? i18n.t("Hidden") : i18n.t(nodeNames[item.type])}</small></button></li>)}</ol>{node && <div className="canvas-layer-actions"><button type="button" disabled={locked || document.nodes.at(-1)?.id === node.id} onClick={() => change(reorderNode(document, node.id, 1))}>{i18n.t("Bring forward")}</button><button type="button" disabled={locked || document.nodes[0]?.id === node.id} onClick={() => change(reorderNode(document, node.id, -1))}>{i18n.t("Send backward")}</button><button type="button" disabled={locked || document.nodes.length >= 100} onClick={duplicate}>{i18n.t("Duplicate")}</button><button type="button" disabled={locked} onClick={remove}>{i18n.t("Remove")}</button></div>}<p className="canvas-help">{i18n.t("Arrow keys: 1 px. Shift: 10 px. Press Escape to clear the selection.")}</p></aside>
        <CanvasStage document={document} breakpoint={breakpoint} origin={origin} zoom={zoom} selected={selected} readOnly={locked} onSelect={setSelected} onTransient={next => { if (!locked) setHistory(current => ({ ...current, present: next })); }} onCommit={(before, after) => { if (!locked) setHistory(current => commitHistory(current, after, before)); }} onKeyboard={keyboard} />
        <CanvasInspector document={document} node={node} breakpoint={breakpoint} readOnly={locked} onChange={change} />
      </div>}
      <footer className="cms-savebar canvas-savebar"><div><strong>{readOnly ? i18n.t("View only") : busy ? i18n.t("Saving…") : dirty ? i18n.t("Unsaved changes") : i18n.t("Draft saved")}</strong><p>{page.published ? i18n.t("Published: {address}",{address:page.published.slug === document.slug ? '/p/' + page.published.slug : '/p/' + page.published.slug + i18n.t(" (previous address)")}) : i18n.t("Not published yet")}{homePageID === page.id ? i18n.t(" · Active homepage") : ''}</p>{dirty && <p>{i18n.t("Save the draft before publishing.")}</p>}</div><div className="canvas-save-actions">{dirty && !readOnly && <button type="button" className="text-button" disabled={busy} onClick={() => { if (!window.confirm(i18n.t("Discard local changes and return to the loaded or last saved version?"))) return; setHistory(initialHistory(savedDocument)); setPage(current => current ? { ...current, draftRevision: savedRevision } : current); try { sessionStorage.removeItem(storageKey); } catch {} setError(''); setMessage(msgid("Local changes discarded.")); }}>{i18n.t("Discard changes")}</button>}<button type="button" className="button secondary" disabled={locked || !dirty} onClick={save}>{i18n.t("Save draft")}</button><button type="button" className="button" disabled={locked || dirty || page.publishedRevision === page.draftRevision} onClick={publish}>{i18n.t("Publish")}</button>{page.published && <a className="button secondary" href={origin + '/p/' + page.published.slug} target="_blank" rel="noopener noreferrer">{i18n.t("Open page ↗")}</a>}</div></footer>
      {(page.published || canSetHomepage && homePageID !== null) && <div className="canvas-publication-tools">{page.published && <button type="button" className="text-button" disabled={locked || dirty} onClick={unpublish}>{i18n.t("Unpublish")}</button>}{canSetHomepage && page.published && homePageID !== page.id && <button type="button" className="text-button" disabled={locked || dirty || page.publishedRevision !== page.draftRevision} onClick={() => homepage(page.id)}>{i18n.t("Use as homepage")}</button>}{canSetHomepage && homePageID !== null && <button type="button" className="text-button" disabled={locked} onClick={() => homepage(null)}>{i18n.t("Restore original homepage")}</button>}</div>}
    </>}
  </div>;
}
