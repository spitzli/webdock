export type Breakpoint = 'desktop' | 'tablet' | 'mobile';
export type NodeType = 'text' | 'image' | 'box' | 'button';
export type Frame = { x: number; y: number; width: number; height: number; hidden: boolean };
export type NodeStyle = {
 background: string; color: string; fontFamily: 'sans' | 'serif' | 'mono';
 fontSize: number; fontWeight: number; align: 'left' | 'center' | 'right'; lineHeight: number;
 borderColor: string; borderWidth: number; radius: number; opacity: number; fit: 'cover' | 'contain';
};
export type CanvasNode = {
 id: string; name: string; type: NodeType; text: string; src: string; alt: string; href: string;
 frames: Record<Breakpoint, Frame>; styles: Record<Breakpoint, NodeStyle>;
};
export type CanvasDocument = {
 schemaVersion: 1; title: string; slug: string;
 artboards: Record<Breakpoint, { width: number; height: number; background: string }>;
 nodes: CanvasNode[];
};
export type CanvasPage = {
 id: number; draft: CanvasDocument; draftRevision: number; published: CanvasDocument | null;
 publishedRevision: number | null; publishedAt: string | null; updatedAt: string;
};
export type CanvasPageSummary = {
 id: number; title: string; slug: string; draftRevision: number;
 publishedRevision: number | null; publishedSlug: string | null; updatedAt: string;
};
export type CanvasList = { pages: CanvasPageSummary[]; homePageID: number | null; nativePath: string };
export const breakpoints: readonly Breakpoint[] = ['desktop', 'tablet', 'mobile'];
const nodeTypes: readonly NodeType[] = ['text', 'image', 'box', 'button'];
const fail = (field: string): never => { throw new Error(`Invalid canvas ${field}.`); };
function object(value: unknown, keys: readonly string[], field: string): Record<string, unknown> {
 if (!value || typeof value !== 'object' || Array.isArray(value)
  || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return fail(field);
 const actual = Object.keys(value);
 if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) return fail(field);
 return value as Record<string, unknown>;
}
function text(value: unknown, min: number, max: number, field: string): string {
 if (typeof value !== 'string' || value.length < min || value.length > max) return fail(field);
 return value;
}
function number(value: unknown, min: number, max: number, field: string): number {
 if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return fail(field);
 return value;
}
function choice<T extends string>(value: unknown, values: readonly T[], field: string): T {
 if (typeof value !== 'string' || !values.includes(value as T)) return fail(field);
 return value as T;
}
function color(value: unknown): string {
 if (typeof value !== 'string' || !/^(?:#[a-f\d]{3}|#[a-f\d]{6}|#[a-f\d]{8}|transparent)$/i.test(value)) return fail('color');
 // CSS keyword is canonical and the only non-hex value the model accepts.
 if (value.toLowerCase() === 'transparent' && value !== 'transparent') return fail('color');
 return value;
}
/** Resolve only explicitly supported navigation/media URLs. No browser or DOM needed. */
export function safeCanvasURL(value: string, kind: 'link' | 'image', origin: string): string | null {
 if (typeof value !== 'string' || !value || value.length > 2000 || /[\\\u0000-\u0020\u007f]/.test(value) || /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(value)) return null;
 try {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.username || base.password) return null;
  if (value.startsWith('#')) return kind === 'link' ? value : null;
  const local = value.startsWith('/') && !value.startsWith('//');
  if (!local && !/^(?:https:\/\/[^/]|mailto:|tel:)/i.test(value)) return null;
  const url = new URL(value, base.origin);
  if (url.username || url.password) return null;
  if (url.protocol === 'https:') return !local || url.origin === base.origin ? url.href : null;
  if (kind === 'link' && ['mailto:', 'tel:'].includes(url.protocol) && url.pathname && !url.pathname.startsWith('//')) return url.href;
 } catch { /* An invalid URL is an inert draft value, never executable markup. */ }
 return null;
}
function url(value: unknown, kind: 'link' | 'image'): string {
 const result = text(value, 0, 2000, `${kind} URL`);
 if (result && !safeCanvasURL(result, kind, 'https://canvas.invalid')) return fail(`${kind} URL`);
 return result;
}
function frame(value: unknown): Frame {
 const v = object(value, ['x', 'y', 'width', 'height', 'hidden'], 'frame');
 if (typeof v.hidden !== 'boolean') return fail('hidden flag');
 return { x: number(v.x, -20000, 20000, 'x'), y: number(v.y, -20000, 20000, 'y'), width: number(v.width, 1, 20000, 'width'), height: number(v.height, 1, 20000, 'height'), hidden: v.hidden };
}
function style(value: unknown): NodeStyle {
 const v = object(value, ['background', 'color', 'fontFamily', 'fontSize', 'fontWeight', 'align', 'lineHeight', 'borderColor', 'borderWidth', 'radius', 'opacity', 'fit'], 'style');
 const fontWeight = number(v.fontWeight, 100, 900, 'font weight');
 if (!Number.isInteger(fontWeight)) return fail('font weight');
 return { background: color(v.background), color: color(v.color), fontFamily: choice(v.fontFamily, ['sans', 'serif', 'mono'], 'font family'), fontSize: number(v.fontSize, 8, 240, 'font size'), fontWeight,
  align: choice(v.align, ['left', 'center', 'right'], 'alignment'), lineHeight: number(v.lineHeight, 0.8, 3, 'line height'), borderColor: color(v.borderColor), borderWidth: number(v.borderWidth, 0, 24, 'border width'), radius: number(v.radius, 0, 1000, 'radius'), opacity: number(v.opacity, 0, 1, 'opacity'), fit: choice(v.fit, ['cover', 'contain'], 'image fit') };
}
function responsive<T>(value: unknown, parse: (value: unknown, breakpoint: Breakpoint) => T): Record<Breakpoint, T> {
 const record = object(value, breakpoints, 'breakpoints');
 return { desktop: parse(record.desktop, 'desktop'), tablet: parse(record.tablet, 'tablet'), mobile: parse(record.mobile, 'mobile') };
}
export function parseCanvasDocument(value: unknown): CanvasDocument {
 let serialized: string | undefined;
 try { serialized = JSON.stringify(value); } catch { return fail('JSON document'); }
 if (!serialized || new TextEncoder().encode(serialized).length > 512 * 1024) return fail('document size (maximum 512 KiB)');
 const v = object(value, ['schemaVersion', 'title', 'slug', 'artboards', 'nodes'], 'document');
 if (v.schemaVersion !== 1) return fail('schema version');
 const slug = text(v.slug, 1, 64, 'slug');
 if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return fail('slug');
 if (!Array.isArray(v.nodes) || v.nodes.length > 100) return fail('node count');
 const ids = new Set<string>();
 const nodes = v.nodes.map(value => {
  const node = object(value, ['id', 'name', 'type', 'text', 'src', 'alt', 'href', 'frames', 'styles'], 'node');
  const id = text(node.id, 1, 80, 'node ID');
  if (!/^[A-Za-z0-9_-]+$/.test(id) || ids.has(id)) return fail('duplicate or malformed node ID');
  ids.add(id);
  return { id, name: text(node.name, 0, 200, 'node name'), type: choice(node.type, nodeTypes, 'node type'), text: text(node.text, 0, 8000, 'text'), src: url(node.src, 'image'), alt: text(node.alt, 0, 200, 'image description'), href: url(node.href, 'link'), frames: responsive(node.frames, frame), styles: responsive(node.styles, style) };
 });
 const ranges: Record<Breakpoint, [number, number]> = { desktop: [1024, 2560], tablet: [768, 1023], mobile: [320, 767] };
 return { schemaVersion: 1, title: text(v.title, 1, 120, 'title'), slug, nodes, artboards: responsive(v.artboards, (value, bp) => {
  const a = object(value, ['width', 'height', 'background'], 'artboard');
  return { width: number(a.width, ...ranges[bp], 'artboard width'), height: number(a.height, 100, 20000, 'artboard height'), background: color(a.background) };
 }) };
}
export function createCanvasDocument(title = 'Untitled page', slug = 'new-page'): CanvasDocument {
 return parseCanvasDocument({ schemaVersion: 1, title, slug, artboards: { desktop: { width: 1440, height: 1000, background: '#ffffff' }, tablet: { width: 768, height: 1000, background: '#ffffff' }, mobile: { width: 390, height: 1000, background: '#ffffff' } }, nodes: [] });
}
export function createCanvasNode(type: NodeType): CanvasNode {
 choice(type, nodeTypes, 'node type');
 const isButton = type === 'button';
 const makeFrame = (bp: Breakpoint): Frame => ({ x: 24, y: 24, width: isButton ? 180 : bp === 'mobile' ? 280 : 360, height: isButton ? 56 : type === 'image' || type === 'box' ? 220 : 120, hidden: false });
 const makeStyle = (): NodeStyle => ({ background: isButton ? '#1f2937' : type === 'box' ? '#eef0f3' : 'transparent', color: isButton ? '#ffffff' : '#111827', fontFamily: 'sans', fontSize: isButton ? 18 : 24, fontWeight: isButton ? 600 : 400, align: isButton ? 'center' : 'left', lineHeight: 1.4, borderColor: 'transparent', borderWidth: 0, radius: isButton ? 8 : 0, opacity: 1, fit: 'cover' });
 return { id: crypto.randomUUID(), name: { text: 'Text', image: 'Image', box: 'Box', button: 'Button' }[type], type, text: isButton ? 'Button' : type === 'text' ? 'Your text' : '', src: '', alt: '', href: '', frames: { desktop: makeFrame('desktop'), tablet: makeFrame('tablet'), mobile: makeFrame('mobile') }, styles: { desktop: makeStyle(), tablet: makeStyle(), mobile: makeStyle() } };
}
