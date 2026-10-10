import { breakpoints, parseCanvasDocument, safeCanvasURL, type Breakpoint, type CanvasDocument, type CanvasNode } from './model.ts';
export { safeCanvasURL } from './model.ts';
type Options = { origin: string; breakpoint?: Breakpoint; interactive?: boolean };
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const fonts = { sans: 'Arial,Helvetica,sans-serif', serif: 'Georgia,Times New Roman,serif', mono: 'Courier New,Courier,monospace' };
const decimal = (value: number) => String(Number(value.toPrecision(12)));
const percent = (value: number, total: number) => `${decimal(value / total * 100)}%`;
const scaled = (value: number, width: number) => `${decimal(value / width * 100)}cqw`;
const css = `.wdc-canvas{position:relative;isolation:isolate;container-type:inline-size;width:100%;margin:0;padding:0;border:0;min-width:0;text-align:left}.wdc-canvas,.wdc-canvas *{box-sizing:border-box}.wdc-canvas>.wdc-artboard{position:relative;width:100%;margin:0;padding:0;border:0;overflow:hidden}.wdc-canvas .wdc-node{position:absolute;margin:0;padding:0;min-width:0;max-width:none;min-height:0;max-height:none;box-shadow:none;text-transform:none;text-decoration:none;letter-spacing:normal;word-spacing:normal;white-space:pre-wrap;overflow-wrap:anywhere;overflow:hidden}.wdc-canvas .wdc-image{display:block}.wdc-canvas .wdc-button,.wdc-canvas .wdc-image-placeholder{display:flex;align-items:center}.wdc-canvas .wdc-image-placeholder{justify-content:center}.wdc-canvas a.wdc-button:focus-visible{outline:2px solid currentColor;outline-offset:-2px}.wdc-canvas[data-canvas-mode="responsive"]>.wdc-artboard{display:none}.wdc-canvas[data-canvas-mode="responsive"]>.wdc-artboard[data-canvas-breakpoint="mobile"]{display:block}@media(min-width:768px){.wdc-canvas[data-canvas-mode="responsive"]>.wdc-artboard[data-canvas-breakpoint="mobile"]{display:none}.wdc-canvas[data-canvas-mode="responsive"]>.wdc-artboard[data-canvas-breakpoint="tablet"]{display:block}}@media(min-width:1024px){.wdc-canvas[data-canvas-mode="responsive"]>.wdc-artboard[data-canvas-breakpoint="tablet"]{display:none}.wdc-canvas[data-canvas-mode="responsive"]>.wdc-artboard[data-canvas-breakpoint="desktop"]{display:block}}`;
function validatedDraft(document: CanvasDocument, options: Options): CanvasDocument {
 if (options.breakpoint !== undefined && !breakpoints.includes(options.breakpoint)) throw new Error('Invalid canvas breakpoint.');
 if (!safeCanvasURL('/', 'image', options.origin)) throw new Error('Invalid canvas origin.');
 // Invalid in-progress URL strings render inert. Every other field, including
 // all CSS-producing values, still goes through the strict shared validator.
 const draft = { ...document, nodes: Array.isArray(document.nodes) ? document.nodes.map(node => ({ ...node,
  src: typeof node.src === 'string' && node.src.length <= 2000 && !safeCanvasURL(node.src, 'image', options.origin) ? '' : node.src,
  href: typeof node.href === 'string' && node.href.length <= 2000 && !safeCanvasURL(node.href, 'link', options.origin) ? '' : node.href,
 })) : document.nodes };
 return parseCanvasDocument(draft);
}
function renderNode(node: CanvasNode, bp: Breakpoint, document: CanvasDocument, options: Options) {
 const frame = node.frames[bp], style = node.styles[bp], board = document.artboards[bp];
 if (frame.hidden) return '';
 const inline = `left:${percent(frame.x, board.width)};top:${percent(frame.y, board.height)};width:${percent(frame.width, board.width)};height:${percent(frame.height, board.height)};background:${style.background};color:${style.color};font-family:${fonts[style.fontFamily]};font-size:${scaled(style.fontSize, board.width)};font-weight:${style.fontWeight};line-height:${style.lineHeight};text-align:${style.align};border:${scaled(style.borderWidth, board.width)} solid ${style.borderColor};border-radius:${scaled(style.radius, board.width)};opacity:${style.opacity};object-fit:${style.fit};justify-content:${{ left: 'flex-start', center: 'center', right: 'flex-end' }[style.align]}`;
 const attributes = `data-canvas-node="${escape(node.id)}" style="${escape(inline)}"`;
 if (node.type === 'image') {
  const src = safeCanvasURL(node.src, 'image', options.origin);
  return src ? `<img class="wdc-node wdc-image" ${attributes} src="${escape(src)}" alt="${escape(node.alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
   : `<div class="wdc-node wdc-image-placeholder" ${attributes} role="img" aria-label="${escape(node.alt || node.name || 'Image')}">Image</div>`;
 }
 if (node.type === 'button') {
  const href = options.interactive === false ? null : safeCanvasURL(node.href, 'link', options.origin);
  return href ? `<a class="wdc-node wdc-button" ${attributes} href="${escape(href)}" rel="noopener noreferrer">${escape(node.text)}</a>`
   : `<span class="wdc-node wdc-button" ${attributes} aria-disabled="true">${escape(node.text)}</span>`;
 }
 return `<div class="wdc-node wdc-${node.type}" ${attributes}>${node.type === 'text' ? escape(node.text) : ''}</div>`;
}
function fragment(document: CanvasDocument, options: Options): string {
 const selected = options.breakpoint ? [options.breakpoint] : breakpoints;
 const sections = selected.map(bp => {
  const board = document.artboards[bp];
  return `<section class="wdc-artboard" data-canvas-breakpoint="${bp}" style="aspect-ratio:${board.width}/${board.height};background:${board.background}">${document.nodes.map(node => renderNode(node, bp, document, options)).join('')}</section>`;
 }).join('');
 return `<style>${css}</style><div class="wdc-canvas" data-canvas-mode="${options.breakpoint || 'responsive'}">${sections}</div>`;
}
export function renderCanvasFragment(document: CanvasDocument, options: Options): string {
 return fragment(validatedDraft(document, options), options);
}
export function renderCanvasHTML(document: CanvasDocument, options: Options & { favicon?: string }): string {
 const valid = validatedDraft(document, options), favicon = options.favicon ? safeCanvasURL(options.favicon, 'image', options.origin) : null;
 return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(valid.title)}</title>${favicon ? `<link rel="icon" href="${escape(favicon)}">` : ''}<style>html,body{margin:0;padding:0;width:100%;min-height:100%}</style></head><body>${fragment(valid, options)}</body></html>`;
}
