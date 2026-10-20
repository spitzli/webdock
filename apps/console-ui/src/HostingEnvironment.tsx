import { useRef, useState } from "react";
// Behaviour follows the retained hosting editor: saved values stay hidden and are never sent back.
interface Row { id: number; name: string; value: string; saved: boolean; editing: boolean; removed: boolean; visible: boolean }
export function HostingEnvironment({ names, disabled, changed }: { names: string[]; disabled: boolean; changed: () => void }) {
  const serial = useRef(names.length);
  const [rows, setRows] = useState<Row[]>(() =>
    names.map((name, id) => ({ id, name, value: "", saved: true, editing: false, removed: false, visible: false })),
  );
  const edit = (id: number, patch: Partial<Row>) => {
    if (Object.keys(patch).some((key) => key !== "visible")) changed();
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };
  const patch = rows
    .filter((row) => row.removed || row.editing || !row.saved)
    .map((row) => ({ name: row.name, value: row.removed ? null : row.value }));
  return <fieldset disabled={disabled}>
    <legend>Environment variables</legend>
    <p className="field-hint">Values are encrypted and hidden after saving. Changes take effect with the requested update. Do not print secrets in application logs.</p>
    <input type="hidden" name="environment" value={JSON.stringify(patch)} />
    {rows.length === 0 ? <p className="muted">No environment variables configured.</p> : null}
    {rows.map((row, index) => <div key={row.id} className="environment-row">
      <label>
        Variable name
        <input aria-label={`Variable name ${String(index + 1)}`} value={row.name} readOnly={row.saved} disabled={row.removed} required={!row.removed}
          ref={(input) => { input?.setCustomValidity(rows.some((other) => other.id !== row.id && !other.removed && other.name === row.name && row.name) ? "This variable name is already used." : ""); }}
          title="Start with a letter or _, then letters, digits or _."
          pattern="[A-Za-z_][A-Za-z0-9_]*" maxLength={128} autoComplete="off" spellCheck={false}
          onChange={(event) => { edit(row.id, { name: event.target.value }); }} />
      </label>
      <label>
        Value
        {row.removed ? <span className="muted">Will be removed when saved</span>
          : row.saved && !row.editing ? <span className="muted">Saved value — hidden</span>
          : <input aria-label={`Value ${String(index + 1)}`} type={row.visible ? "text" : "password"} value={row.value} maxLength={4096}
            autoComplete="new-password" spellCheck={false} onChange={(event) => { edit(row.id, { value: event.target.value }); }} />}
      </label>
      <div className="form-actions">
        {row.removed
          ? <button type="button" className="button" onClick={() => { edit(row.id, { removed: false }); }}>Undo</button>
          : <>
            {row.saved && !row.editing
              ? <button type="button" className="button" onClick={() => { edit(row.id, { editing: true }); }}>Replace value</button>
              : <button type="button" className="button" aria-pressed={row.visible} onClick={() => { edit(row.id, { visible: !row.visible }); }}>{row.visible ? "Hide value" : "Show value"}</button>}
            <button type="button" className="button" aria-label={`Remove variable ${row.name || String(index + 1)}`}
              onClick={() => {
                if (row.saved) edit(row.id, { removed: true, editing: false, value: "", visible: false });
                else { changed(); setRows((current) => current.filter((item) => item.id !== row.id)); }
              }}>Remove</button>
          </>}
      </div>
    </div>)}
    {rows.filter((row) => !row.removed).length < 32
      ? <button type="button" className="button" onClick={() => {
        changed();
        const id = serial.current++;
        setRows((current) => [...current, { id, name: "", value: "", saved: false, editing: true, removed: false, visible: false }]);
      }}>Add variable</button>
      : null}
  </fieldset>;
}
