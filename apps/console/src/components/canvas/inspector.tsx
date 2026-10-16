'use client';
import { useI18n } from '@webdock/i18n/react';

import { useState } from 'react';
import type { Breakpoint, CanvasDocument, CanvasNode, Frame, NodeStyle } from '@webdock/page-builder/model';
function NumberField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  const [buffer, setBuffer] = useState({ source: value, text: String(value) });
  // Retain partial typing after our own commits, but reflect external drag/undo updates.
  if (buffer.source !== value) setBuffer({ source: value, text: String(value) });
  return <label>{label}<input type="number" value={buffer.text} min={min} max={max} step={step}
    onChange={event => {
      const text = event.target.value, next = Number(text);
      const valid = text.trim() !== '' && Number.isFinite(next) && next >= min && next <= max;
      setBuffer({ source: valid ? next : value, text });
      if (valid && next !== value) onChange(next);
    }}
    onBlur={event => {
      const text = event.target.value, parsed = Number(text);
      const next = text.trim() === '' || !Number.isFinite(parsed) ? value : Math.min(max, Math.max(min, parsed));
      setBuffer({ source: next, text: String(next) });
      if (next !== value) onChange(next);
    }}
    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }}
  /></label>;
}
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
 const i18n=useI18n();
  const swatch = /^#[\da-f]{6,8}$/i.test(value) ? value.slice(0, 7) : /^#[\da-f]{3}$/i.test(value) ? '#' + value.slice(1).split('').map(part => part + part).join('') : '#ffffff';
  return <label>{label}<span className="canvas-color-field"><input type="color" aria-label={i18n.t("Choose {label}",{label})} value={swatch} onChange={event => onChange(event.target.value)} /><input value={value} maxLength={11} onChange={event => onChange(event.target.value)} spellCheck={false} /></span></label>;
}
export function CanvasInspector({ document, node, breakpoint, readOnly, onChange }: { document: CanvasDocument; node: CanvasNode | undefined; breakpoint: Breakpoint; readOnly: boolean; onChange: (document: CanvasDocument) => void }) {
  const i18n = useI18n();

  const board = document.artboards[breakpoint];
  const setBoard = (values: Partial<typeof board>) => onChange({ ...document, artboards: { ...document.artboards, [breakpoint]: { ...board, ...values } } });
  const setNode = (values: Partial<CanvasNode>) => node && onChange({ ...document, nodes: document.nodes.map(item => item.id === node.id ? { ...item, ...values } : item) });
  const setFrame = (values: Partial<Frame>) => node && setNode({ frames: { ...node.frames, [breakpoint]: { ...node.frames[breakpoint], ...values } } });
  const setStyle = (values: Partial<NodeStyle>) => node && setNode({ styles: { ...node.styles, [breakpoint]: { ...node.styles[breakpoint], ...values } } });
  const style = node?.styles[breakpoint], frame = node?.frames[breakpoint];
  return <aside className="canvas-inspector" aria-label={i18n.t("Properties")}><h2>{node ? i18n.t("Element") : i18n.t("Page")}</h2><fieldset disabled={readOnly}>
    {!node ? <>
      <label>{i18n.t("Page title")}<input value={document.title} maxLength={120} onChange={event => onChange({ ...document, title: event.target.value })} /></label>
      <label>{i18n.t("Page address")}<input value={document.slug} maxLength={64} onChange={event => onChange({ ...document, slug: event.target.value.toLowerCase() })} spellCheck={false} /></label>
      <p className="canvas-help">{i18n.t("Published address: /p/")}{document.slug || i18n.t("page-name")}</p>
      <div className="canvas-property-grid"><NumberField label={i18n.t("Width")} value={board.width} min={breakpoint === 'desktop' ? 1024 : breakpoint === 'tablet' ? 768 : 320} max={breakpoint === 'desktop' ? 2560 : breakpoint === 'tablet' ? 1023 : 767} onChange={width => setBoard({ width })} /><NumberField label={i18n.t("Height")} value={board.height} min={100} max={20000} onChange={height => setBoard({ height })} /></div>
      <ColorField label={i18n.t("Background")} value={board.background} onChange={background => setBoard({ background })} />
      <p className="canvas-help">{i18n.t("Size and background apply to the selected screen size.")}</p>
    </> : frame && style && <>
      <label>{i18n.t("Layer name")}<input value={node.name} maxLength={200} onChange={event => setNode({ name: event.target.value })} /></label>
      <div className="canvas-property-grid"><NumberField label={i18n.t("X")} value={frame.x} min={-20000} max={20000} onChange={x => setFrame({ x })} /><NumberField label={i18n.t("Y")} value={frame.y} min={-20000} max={20000} onChange={y => setFrame({ y })} /><NumberField label={i18n.t("Width")} value={frame.width} min={1} max={20000} onChange={width => setFrame({ width })} /><NumberField label={i18n.t("Height")} value={frame.height} min={1} max={20000} onChange={height => setFrame({ height })} /></div>
      <label className="canvas-checkbox"><input type="checkbox" checked={frame.hidden} onChange={event => setFrame({ hidden: event.target.checked })} />{i18n.t("Hide in this view")}</label>
      {(node.type === 'text' || node.type === 'button') && <label>{node.type === 'button' ? i18n.t("Button label") : i18n.t("Text")}<textarea rows={4} value={node.text} maxLength={8000} onChange={event => setNode({ text: event.target.value })} /></label>}
      {node.type === 'image' && <><label>{i18n.t("Image URL")}<input value={node.src} maxLength={2000} onChange={event => setNode({ src: event.target.value })} placeholder={i18n.t("/images/photo.jpg or https://…")} spellCheck={false} /></label><label>{i18n.t("Alternative text")}<input value={node.alt} maxLength={200} onChange={event => setNode({ alt: event.target.value })} /></label><label>{i18n.t("Image fit")}<select value={style.fit} onChange={event => setStyle({ fit: event.target.value as NodeStyle['fit'] })}><option value="cover">{i18n.t("Cover")}</option><option value="contain">{i18n.t("Contain")}</option></select></label></>}
      {node.type === 'button' && <label>{i18n.t("Link destination")}<input value={node.href} maxLength={2000} onChange={event => setNode({ href: event.target.value })} placeholder={i18n.t("/contact or https://…")} spellCheck={false} /></label>}
      {(node.type === 'text' || node.type === 'button') && <><h3>{i18n.t("Typography")}</h3><label>{i18n.t("Font family")}<select value={style.fontFamily} onChange={event => setStyle({ fontFamily: event.target.value as NodeStyle['fontFamily'] })}><option value="sans">{i18n.t("Sans Serif")}</option><option value="serif">{i18n.t("Serif")}</option><option value="mono">{i18n.t("Monospace")}</option></select></label><div className="canvas-property-grid"><NumberField label={i18n.t("Size")} value={style.fontSize} min={8} max={240} onChange={fontSize => setStyle({ fontSize })} /><NumberField label={i18n.t("Weight")} value={style.fontWeight} min={100} max={900} step={100} onChange={fontWeight => setStyle({ fontWeight: Math.round(fontWeight) })} /><NumberField label={i18n.t("Line height")} value={style.lineHeight} min={.8} max={3} step={.1} onChange={lineHeight => setStyle({ lineHeight })} /><label>{i18n.t("Alignment")}<select value={style.align} onChange={event => setStyle({ align: event.target.value as NodeStyle['align'] })}><option value="left">{i18n.t("Left")}</option><option value="center">{i18n.t("Centre")}</option><option value="right">{i18n.t("Right")}</option></select></label></div><ColorField label={i18n.t("Text colour")} value={style.color} onChange={color => setStyle({ color })} /></>}
      <h3>{i18n.t("Appearance")}</h3><ColorField label={i18n.t("Fill colour")} value={style.background} onChange={background => setStyle({ background })} /><ColorField label={i18n.t("Border colour")} value={style.borderColor} onChange={borderColor => setStyle({ borderColor })} /><div className="canvas-property-grid"><NumberField label={i18n.t("Border")} value={style.borderWidth} min={0} max={24} onChange={borderWidth => setStyle({ borderWidth })} /><NumberField label={i18n.t("Corner radius")} value={style.radius} min={0} max={1000} onChange={radius => setStyle({ radius })} /><NumberField label={i18n.t("Opacity")} value={style.opacity} min={0} max={1} step={.05} onChange={opacity => setStyle({ opacity })} /></div>
      <p className="canvas-help">{i18n.t("Position and style apply only to the selected screen size. Content and name apply everywhere.")}</p>
    </>}
  </fieldset></aside>;
}
