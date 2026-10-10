import type { Breakpoint, CanvasDocument, Frame } from '@webdock/page-builder/model';
export type History = { past: CanvasDocument[]; present: CanvasDocument; future: CanvasDocument[] };
export const initialHistory = (document: CanvasDocument): History => ({ past: [], present: document, future: [] });
export const sameDocument = (a: CanvasDocument, b: CanvasDocument) => JSON.stringify(a) === JSON.stringify(b);
export function commitHistory(history: History, document: CanvasDocument, before = history.present): History {
  if (sameDocument(before, document)) return { ...history, present: document };
  return { past: [...history.past, before].slice(-80), present: document, future: [] };
}
export function undoHistory(history: History): History {
  const previous = history.past.at(-1);
  return previous ? { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] } : history;
}
export function redoHistory(history: History): History {
  const next = history.future[0];
  return next ? { past: [...history.past, history.present].slice(-80), present: next, future: history.future.slice(1) } : history;
}
export type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
const bounded = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value)));
export function pointerFrame(frame: Frame, dx: number, dy: number, zoom: number, handle?: ResizeHandle): Frame {
  const x = dx / zoom, y = dy / zoom;
  if (!handle) return { ...frame, x: bounded(frame.x + x, -20000, 20000), y: bounded(frame.y + y, -20000, 20000) };
  let { x: left, y: top, width, height } = frame;
  if (handle.includes('e')) width = bounded(width + x, 1, 20000);
  if (handle.includes('s')) height = bounded(height + y, 1, 20000);
  if (handle.includes('w')) { width = bounded(frame.width - x, 1, 20000); left = bounded(frame.x + frame.width - width, -20000, 20000); }
  if (handle.includes('n')) { height = bounded(frame.height - y, 1, 20000); top = bounded(frame.y + frame.height - height, -20000, 20000); }
  return { ...frame, x: left, y: top, width, height };
}
export function setNodeFrame(document: CanvasDocument, id: string, breakpoint: Breakpoint, frame: Frame): CanvasDocument {
  return { ...document, nodes: document.nodes.map(node => node.id === id ? { ...node, frames: { ...node.frames, [breakpoint]: frame } } : node) };
}
export function reorderNode(document: CanvasDocument, id: string, direction: -1 | 1): CanvasDocument {
  const index = document.nodes.findIndex(node => node.id === id), target = index + direction;
  if (index < 0 || target < 0 || target >= document.nodes.length) return document;
  const nodes = [...document.nodes];
  [nodes[index], nodes[target]] = [nodes[target], nodes[index]];
  return { ...document, nodes };
}
