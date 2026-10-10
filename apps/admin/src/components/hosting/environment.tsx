"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { useI18n } from "@webdock/i18n/react";
import { HostingSaveContext, HostingPendingContext } from "./form";
type Row = {
  id: number;
  name: string;
  value: string;
  saved: boolean;
  editing: boolean;
  removed: boolean;
  visible: boolean;
};
export function ApplicationEnvironment({ names = [], build = false }: { names?: string[]; build?: boolean }) {
  const { t } = useI18n(),
    result = useContext(HostingSaveContext),
    pending = useContext(HostingPendingContext),
    serial = useRef(0);
  const makeRows = () =>
    names.map((name) => ({
      id: serial.current++,
      name,
      value: "",
      saved: true,
      editing: false,
      removed: false,
      visible: false,
    }));
  const [rows, setRows] = useState<Row[]>(makeRows);
  useEffect(() => {
    if (result.message && !result.error) setRows(current=>result.environmentReset?[]:current.filter(row=>!row.removed).map(row=>({...row,value:'',saved:true,editing:false,visible:false})));
  }, [result]);
  const edit = (id: number, patch: Partial<Row>) =>
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  const patch = rows
    .filter((r) => r.removed || r.editing || !r.saved)
    .map((r) => ({ name: r.name, value: r.removed ? null : r.value }));
  return (
    <fieldset className="hosting-environment" disabled={pending}>
      <legend>{build ? t("Build environment variables") : t("Environment variables")}</legend>
      <p className="help">
        {build ? t("Only these build values reach repository code. Repository scripts can read them. Runtime variables are configured separately.") : t(
          "Values are encrypted and hidden after saving. Changes take effect with the next application deployment. Do not print secrets in application logs.",
        )}
      </p>
      <input type="hidden" name={build ? "buildEnvironment" : "environment"} value={JSON.stringify(patch)} />
      {rows.length === 0 && (
        <p className="help">{t("No environment variables configured.")}</p>
      )}
      {rows.map((row, i) => (
        <div
          className={`hosting-env-row${row.removed ? " is-removed" : ""}`}
          key={row.id}
        >
          <label className="field">
            {t("Variable name")}
            <input
              aria-label={t("Variable name") + " " + (i + 1)}
              value={row.name}
              readOnly={row.saved}
              disabled={row.removed}
              required={!row.removed}
              pattern="[A-Za-z_][A-Za-z0-9_]*"
              maxLength={128}
              placeholder="DISCORD_TOKEN"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => edit(row.id, { name: e.target.value })}
            />
          </label>
          <label className="field">
            {t("Value")}
            {row.removed ? (
              <span className="hosting-env-status">
                {t("Will be removed when saved")}
              </span>
            ) : row.saved && !row.editing ? (
              <span className="hosting-env-status">
                {t("Saved value — hidden")}
              </span>
            ) : (
              <input
                aria-label={t("Value") + " " + (i + 1)}
                type={row.visible ? "text" : "password"}
                value={row.value}
                maxLength={4096}
                autoComplete="new-password"
                spellCheck={false}
                onChange={(e) => edit(row.id, { value: e.target.value })}
              />
            )}
          </label>
          <div className="hosting-env-actions">
            {row.removed ? (
              <button
                type="button"
                className="button secondary"
                onClick={() => edit(row.id, { removed: false })}
              >
                {t("Undo")}
              </button>
            ) : (
              <>
                {row.saved && !row.editing ? (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => edit(row.id, { editing: true })}
                  >
                    {t("Replace value")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button secondary"
                    aria-pressed={row.visible}
                    onClick={() => edit(row.id, { visible: !row.visible })}
                  >
                    {row.visible ? t("Hide value") : t("Show value")}
                  </button>
                )}
                <button
                  type="button"
                  className="button secondary"
                  aria-label={
                    t("Remove variable") + " " + (row.name || String(i + 1))
                  }
                  onClick={() =>
                    row.saved
                      ? edit(row.id, {
                          removed: true,
                          editing: false,
                          value: "",
                          visible: false,
                        })
                      : setRows((current) =>
                          current.filter((r) => r.id !== row.id),
                        )
                  }
                >
                  {t("Remove")}
                </button>
              </>
            )}
          </div>
        </div>
      ))}
      {rows.filter((r) => !r.removed).length < 32 && (
        <button
          type="button"
          className="button secondary"
          onClick={() =>
            setRows((current) => [
              ...current,
              {
                id: serial.current++,
                name: "",
                value: "",
                saved: false,
                editing: true,
                removed: false,
                visible: false,
              },
            ])
          }
        >
          {t("Add variable")}
        </button>
      )}
    </fieldset>
  );
}
