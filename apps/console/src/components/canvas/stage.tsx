'use client';
import { useI18n } from '@webdock/i18n/react';

import { useRef, type PointerEvent, type KeyboardEvent } from 'react';
import type { Breakpoint, CanvasDocument, Frame } from '@webdock/page-builder/model';
import { renderCanvasFragment } from '@webdock/page-builder/render';
import { pointerFrame, setNodeFrame, type ResizeHandle } from './history';
const handles: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
export function CanvasStage({ document, breakpoint, origin, zoom, selected, readOnly, onSelect, onTransient, onCommit, onKeyboard }: {
  document: CanvasDocument; breakpoint: Breakpoint; origin: string; zoom: number; selected: string | null; readOnly: boolean;
  onSelect: (id: string | null) => void; onTransient: (document: CanvasDocument) => void;
  onCommit: (before: CanvasDocument, after: CanvasDocument) => void; onKeyboard: (event: KeyboardEvent) => void;
}) {
  const i18n = useI18n();

  const gesture = useRef<{ pointer: number; x: number; y: number; id: string; frame: Frame; handle?: ResizeHandle; before: CanvasDocument; after: CanvasDocument } | null>(null);
  const board = document.artboards[breakpoint];
  let markup = '';
  try { markup = renderCanvasFragment(document, { origin, breakpoint, interactive: false }); } catch { /* Incomplete inspector values stay editable instead of crashing the editor. */ }
  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-canvas-node]') : null;
    const node = document.nodes.find(item => item.id === target?.dataset.canvasNode);
    onSelect(node?.id || null);
    event.currentTarget.focus({ preventScroll: true });
    if (!node || readOnly) return;
    event.preventDefault();
    const handle = (event.target as HTMLElement).dataset.resize as ResizeHandle | undefined;
    gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, id: node.id, frame: node.frames[breakpoint], handle, before: document, after: document };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const state = gesture.current;
    if (!state || state.pointer !== event.pointerId) return;
    const frame = pointerFrame(state.frame, event.clientX - state.x, event.clientY - state.y, zoom, state.handle);
    state.after = setNodeFrame(state.before, state.id, breakpoint, frame);
    onTransient(state.after);
  }
  function end(event: PointerEvent<HTMLDivElement>, cancel = false) {
    const state = gesture.current;
    if (!state || state.pointer !== event.pointerId) return;
    gesture.current = null;
    if (cancel) onTransient(state.before); else onCommit(state.before, state.after);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return <div className="canvas-stage-scroll"><div className="canvas-stage-size" style={{ width: board.width * zoom, height: board.height * zoom }}>
    <div className="canvas-stage-surface" style={{ width: board.width, height: board.height, transform: `scale(${zoom})` }} tabIndex={0} role="group" aria-label={i18n.t("Design canvas. Select elements and move them with arrow keys.")} onPointerDown={start} onPointerMove={move} onPointerUp={event => end(event)} onPointerCancel={event => end(event, true)} onLostPointerCapture={event => end(event, true)} onKeyDown={event => {
      if (gesture.current) { if (event.key === 'Escape') { onTransient(gesture.current.before); gesture.current = null; } event.preventDefault(); event.stopPropagation(); return; }
      event.stopPropagation(); onKeyboard(event);
    }}>
      {markup ? <div className="canvas-stage-render" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} /> : <p className="canvas-stage-validation" role="status">{i18n.t("Preview paused. Complete the title, address and colour values.")}</p>}
      {document.nodes.map(node => { const frame = node.frames[breakpoint]; if (frame.hidden) return null; return <div key={node.id} data-canvas-node={node.id} className={`canvas-node-target${node.id === selected ? ' is-selected' : ''}`} style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }} title={node.name}>
        {node.id === selected && <><span className="canvas-selection-label">{node.name}</span>{!readOnly && handles.map(handle => <span key={handle} className={`canvas-resize-handle canvas-handle-${handle}`} data-resize={handle} />)}</>}
      </div>; })}
    </div>
  </div></div>;
}
