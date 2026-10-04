import type { Allowances } from "@/lib/plans";

const fields = [
  ["storageBytes", "storageMB", "Storage (MB)", 1_000_000],
  ["mailMessages", "mailMessages", "Mail messages", 1],
  ["transferBytes", "transferGB", "Transfer (GB)", 1_000_000_000],
  ["websites", "websites", "Websites", 1],
  ["editors", "editors", "Editors", 1],
] as const;

export function PlanFields({ values, extras = false }: { values?: Allowances; extras?: boolean }) {
  return <><p className="help">{extras ? "Blank fields add zero. Extras are added to the assigned plan." : "Blank fields are unmetered. Enter 0 for no allocation."} MB and GB use decimal units.</p>
    {fields.map(([key, name, label, divisor]) => <label className="field" key={key}>{label}<input name={name} type="number" min={0} step={divisor === 1 ? 1 : "any"} defaultValue={values?.[key] == null ? "" : values[key] / divisor} /></label>)}
  </>;
}

export function AllowanceList({ values }: { values: Allowances }) {
  return <dl>{fields.map(([key, , label, divisor]) => <div key={key}><dt>{label}</dt><dd>{values[key] === null ? "Unmetered" : (values[key] / divisor).toLocaleString("en-GB", { maximumFractionDigits: 6 })}</dd></div>)}</dl>;
}

export function PlanIdentity({ name = "", description = "" }: { name?: string; description?: string }) {
  return <><label className="field">Name<input name="name" required maxLength={160} defaultValue={name} /></label><label className="field">Description<textarea name="description" maxLength={2000} defaultValue={description} /></label></>;
}
