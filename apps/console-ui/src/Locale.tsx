import { useEffect, useState, type ReactNode, type ChangeEvent } from "react";
import { I18nProvider, useI18n } from "@webdock/i18n/react";
import { resolveLocale, type Preference } from "@webdock/i18n";
import { useApi } from "./context";
export function LocaleProvider({
  preference,
  children,
}: {
  preference: Preference;
  children: ReactNode;
}) {
  const locale = resolveLocale(navigator.languages.join(","), preference);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <I18nProvider locale={locale} preference={preference}>
      {children}
    </I18nProvider>
  );
}
export function LocalePicker() {
  const api = useApi();
  const i18n = useI18n();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const change = async (event: ChangeEvent<HTMLSelectElement>) => {
    const preference = event.target.value;
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch(
        new URL("/api/locale", api.config.apiOrigin),
        {
          method: "POST",
          credentials: "include",
          redirect: "error",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preference }),
        },
      );
      if (!response.ok) throw Error("Language preference failed");
      location.reload();
    } catch {
      setFailed(true);
      setPending(false);
    }
  };
  return (
    <label className="locale-picker">
      <span className="sr-only">{i18n.t("Language")}</span>
      <select
        aria-label={i18n.t("Language")}
        value={i18n.preference}
        disabled={pending}
        onChange={(event) => {
          void change(event);
        }}
      >
        <option value="system">{i18n.t("System")}</option>
        <option value="en">English</option>
        <option value="de">Deutsch</option>
      </select>
      {failed ? (
        <span role="alert" className="error">
          {i18n.t("Something went wrong. Please try again.")}
        </span>
      ) : null}
    </label>
  );
}
