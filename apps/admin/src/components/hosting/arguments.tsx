"use client";
import { useState } from "react";
import { useI18n } from "@webdock/i18n/react";
export function ContainerArguments({ values }: { values: string[] }) {
  const { t } = useI18n(),
    [args, setArgs] = useState(values);
  return (
    <fieldset>
      <legend>{t("Container arguments")}</legend>
      <input type="hidden" name="args" value={JSON.stringify(args)} />
      {args.map((value, i) => (
        <div className="hosting-argument" key={i}>
          <label>
            {t("Argument")} {i + 1}
            <input
              value={value}
              maxLength={512}
              onChange={(e) =>
                setArgs(args.map((v, j) => (i === j ? e.target.value : v)))
              }
            />
          </label>
          <button
            type="button"
            className="button secondary"
            onClick={() => setArgs(args.filter((_, j) => i !== j))}
          >
            {t("Remove argument")}
          </button>
        </div>
      ))}
      {args.length < 20 && (
        <button
          className="button secondary"
          type="button"
          onClick={() => setArgs([...args, ""])}
        >
          {t("Add argument")}
        </button>
      )}
    </fieldset>
  );
}
