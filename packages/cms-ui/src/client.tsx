"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element -- Runtime CMS records have per-instance schemas and image hosts. */
import React, { useEffect, useState, type ComponentType } from "react";
import {msgid} from "@webdock/i18n";
import {I18nProvider,useI18n} from "@webdock/i18n/react";
import { defaultData, editorData } from "./schema";
import type { CMSAppProps, CMSField, RichTextEditorProps } from "./types";
const api = "/api/cms";
async function request(
  query: Record<string, string> = {},
  body?: any,
  method = "POST",
) {
  const response = await fetch(
    api + "?" + new URLSearchParams(query),
    body
      ? {
          method,
          headers:
            body instanceof FormData
              ? {}
              : { "Content-Type": "application/json" },
          body: body instanceof FormData ? body : JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401)
      throw Error(msgid("Your session ended. Reload to sign in again."));
    throw Error(
      [
        result.error,
        ...(result.errors || []).map(
          (e: any) => `${e.path || e.label || ""}: ${e.message}`,
        ),
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  return result;
}
function Relation({
  field,
  value,
  onChange,
  disabled,
  locale,
}: {
  field: CMSField;
  value: any;
  onChange: (v: any) => void;
  disabled: boolean;
  locale: string;
}) {
  const {t,error:translateError,number:formatNumber}=useI18n();
  const collections = Array.isArray(field.relationTo)
    ? field.relationTo
    : [field.relationTo!];
  const [rows, setRows] = useState<any[]>([]),
    [search, setSearch] = useState(""),
    [error, setError] = useState("");
  const [page, setPage] = useState(1),
    [pages, setPages] = useState(1);
  const relation = collections[0];
  useEffect(() => {
    let active = true;
    const controller = setTimeout(() => {
      void request({
        module: relation,
        locale,
        search,
        page: String(page),
      }).then(
        (r) => {
          if (active) {
            setRows(r.docs || []);
            setPages(r.totalPages || 1);
            setError("");
          }
        },
        () => {
          if (active) setError(msgid("Could not load choices. Try again."));
        },
      );
    }, 200);
    return () => {
      active = false;
      clearTimeout(controller);
    };
  }, [relation, locale, search, page]);
  const keyOf = (v: any) =>
    String(
      typeof v === "object"
        ? (v?.value?.id ?? v?.value ?? v?.id ?? "")
        : (v ?? ""),
    );
  const selected = field.hasMany
    ? Array.isArray(value)
      ? value
      : []
    : value
      ? [value]
      : [];
  const choose = (id: string) => {
    const entry = Array.isArray(field.relationTo)
      ? { relationTo: relation, value: id }
      : id;
    if (field.hasMany)
      onChange(
        selected.some((v) => keyOf(v) === id)
          ? selected.filter((v) => keyOf(v) !== id)
          : [...selected, entry],
      );
    else onChange(id ? entry : null);
  };
  return (
    <div className="cms-relation">
      <label className="cms-field-label">
        {t(field.label)}
        {field.required ? " *" : ""}
      </label>
      {selected.length > 0 && (
        <div className="cms-selected">
          {selected.map((v: any) => (
            <span key={keyOf(v)}>
              {rows.find((r) => String(r.id) === keyOf(v))?.title ||
                rows.find((r) => String(r.id) === keyOf(v))?.name ||
                rows.find((r) => String(r.id) === keyOf(v))?.filename ||
                t("Selected item {id}",{id:keyOf(v)})}{" "}
              {!disabled && (
                <button
                  type="button"
                  aria-label={t("Remove selected {field}",{field:t(field.label)})}
                  onClick={() =>
                    field.hasMany
                      ? onChange(selected.filter((x) => keyOf(x) !== keyOf(v)))
                      : onChange(null)
                  }
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      <input
        aria-label={t("Search {field}",{field:t(field.label)})}
        type="search"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        disabled={disabled}
        placeholder={field.type === "upload" ? t("Find an image") : t("Find an item")}
      />
      {error && <p role="alert">{translateError(error)}</p>}
      <div
        className={field.type === "upload" ? "cms-media-picker" : "cms-choices"}
      >
        {rows.map((row) => (
          <button
            type="button"
            key={row.id}
            disabled={disabled}
            aria-pressed={selected.some((v) => keyOf(v) === String(row.id))}
            onClick={() => choose(String(row.id))}
          >
            {field.type === "upload" && row.url && (
              <img src={row.sizes?.thumbnail?.url || row.url} alt="" />
            )}
            <span>{row.title || row.name || row.filename || row.id}</span>
          </button>
        ))}
      </div>
      {pages > 1 && (
        <div className="cms-pagination">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >{t("Previous choices")}</button>
          <span>
            {formatNumber(page)} / {formatNumber(pages)}
          </span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >{t("Next choices")}</button>
        </div>
      )}
      {Array.isArray(field.relationTo) && field.relationTo.length > 1 && (
        <p className="cms-muted">
          {t("Existing linked items are preserved. New choices shown from {collection}.",{collection:relation})}
        </p>
      )}
    </div>
  );
}
function Fields({
  fields,
  data,
  onChange,
  readOnly,
  locale,
  richTextEditor: RichText,
  path = "content",
}: {
  fields: CMSField[];
  data: any;
  onChange: (v: any) => void;
  readOnly: boolean;
  locale: string;
  richTextEditor?: ComponentType<RichTextEditorProps>;
  path?: string;
}) {
  const {t,n}=useI18n();
  return (
    <>
      {fields.map((f, index) => {
        const key = f.name || `section-${index}`,
          value = f.name ? data?.[f.name] : data;
        const id = `${path}-${key}`;
        const disabled = readOnly || !!f.readOnly;
        const set = (v: any) => onChange({ ...data, [f.name!]: v });
        if (f.type === "section")
          return (
            <section className="cms-field-section" key={key}>
              {f.label && <h2>{t(f.label)}</h2>}
              <Fields
                fields={f.fields || []}
                data={data || {}}
                onChange={onChange}
                readOnly={disabled}
                locale={locale}
                richTextEditor={RichText}
                path={id}
              />
            </section>
          );
        if (f.type === "group")
          return (
            <section className="cms-field-section" key={key}>
              <h2>{t(f.label)}</h2>
              {f.description && <p className="cms-help">{t(f.description)}</p>}
              <Fields
                fields={f.fields || []}
                data={value || {}}
                onChange={set}
                readOnly={disabled}
                locale={locale}
                richTextEditor={RichText}
                path={id}
              />
            </section>
          );
        if (["array", "blocks"].includes(f.type)) {
          const items = Array.isArray(value) ? value : [];
          const update = (n: number, v: any) =>
            set(items.map((item, i) => (i === n ? v : item)));
          return (
            <section className="cms-field-section" key={key}>
              <div className="cms-section-heading">
                <h2>{t(f.label)}</h2>
                <span className="cms-muted">{n("{count} item","{count} items",items.length)}</span>
              </div>
              {f.description && <p className="cms-help">{t(f.description)}</p>}
              {items.map((item, n) => {
                const block =
                  f.type === "blocks"
                    ? f.blocks?.find((b) => b.slug === item.blockType)
                    : null;
                const childFields = block?.fields || f.fields || [];
                return (
                  <details
                    className="cms-array-item"
                    open={items.length < 4}
                    key={item.id || `${item.blockType || "item"}-${n}`}
                  >
                    <summary>
                      {item.title ||
                        item.name ||
                        item.question ||
                        item.blockName ||
                        (block?.label ? t(block.label) : "") ||
                        t("Item {number}",{number:n+1})}
                    </summary>
                    <Fields
                      fields={childFields}
                      data={item}
                      onChange={(v) => update(n, v)}
                      readOnly={disabled}
                      locale={locale}
                      richTextEditor={RichText}
                      path={`${id}-${n}`}
                    />
                    {!disabled && (
                      <div className="cms-item-actions">
                        <button
                          type="button"
                          disabled={n === 0}
                          onClick={() => {
                            const next = [...items];
                            [next[n - 1], next[n]] = [next[n], next[n - 1]];
                            set(next);
                          }}
                        >{t("Move up")}</button>
                        <button
                          type="button"
                          disabled={n === items.length - 1}
                          onClick={() => {
                            const next = [...items];
                            [next[n + 1], next[n]] = [next[n], next[n + 1]];
                            set(next);
                          }}
                        >{t("Move down")}</button>
                        <button
                          type="button"
                          disabled={items.length <= (f.minRows || 0)}
                          onClick={() => {
                            if (
                              window.confirm(
                                t("Remove this item from the page? Save to apply the change."),
                              )
                            )
                              set(items.filter((_, i) => i !== n));
                          }}
                        >{t("Remove")}</button>
                      </div>
                    )}
                  </details>
                );
              })}
              {!disabled &&
                items.length < (f.maxRows ?? 500) &&
                (f.type === "blocks" ? (
                  <label className="cms-field">{t("Add a section")}<select
                      value=""
                      onChange={(e) => {
                        const b = f.blocks?.find(
                          (b) => b.slug === e.target.value,
                        );
                        if (b)
                          set([
                            ...items,
                            { blockType: b.slug, ...defaultData(b.fields) },
                          ]);
                      }}
                    >
                      <option value="">{t("Choose a section…")}</option>
                      {f.blocks?.map((b) => (
                        <option key={b.slug} value={b.slug}>
                          {t(b.label)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <button
                    className="cms-button cms-secondary"
                    type="button"
                    onClick={() => set([...items, defaultData(f.fields || [])])}
                  >{t("Add item")}</button>
                ))}
            </section>
          );
        }
        if (["relationship", "upload"].includes(f.type) && f.relationTo)
          return (
            <Relation
              key={key}
              field={f}
              value={value}
              onChange={set}
              disabled={disabled}
              locale={locale}
            />
          );
        if (f.type === "richText")
          return (
            <div className="cms-field" key={key}>
              <span className="cms-field-label">
                {t(f.label)}
                {f.required ? " *" : ""}
              </span>
              {RichText ? (
                <RichText value={value} onChange={set} readOnly={disabled} />
              ) : (
                <div className="cms-notice">{t("This formatted content is preserved. An administrator can edit it in Advanced tools.")}</div>
              )}
            </div>
          );
        if (f.type === "json" || f.readOnly)
          return (
            <details key={key} className="cms-preserved">
              <summary>{t("{field} · managed separately",{field:t(f.label)})}</summary>
              <p className="cms-help">{t("This field is preserved when you save. Use Advanced tools if it needs changing.")}</p>
            </details>
          );
        const label = (
          <label htmlFor={id}>
            {t(f.label)}
            {f.required ? " *" : ""}
            {f.localized && <small> · {locale.toUpperCase()}</small>}
          </label>
        );
        return (
          <div
            className={
              "cms-field " + (f.type === "checkbox" ? "cms-check" : "")
            }
            key={key}
          >
            {f.type !== "checkbox" && label}
            {f.type === "textarea" || f.type === "code" ? (
              <textarea
                id={id}
                value={value ?? ""}
                rows={f.maxLength && f.maxLength > 1000 ? 8 : 4}
                disabled={disabled}
                maxLength={f.maxLength}
                onChange={(e) => set(e.target.value)}
              />
            ) : f.type === "select" || f.type === "radio" ? (
              <select
                id={id}
                value={f.hasMany ? value || [] : (value ?? "")}
                multiple={f.hasMany}
                disabled={disabled}
                onChange={(e) =>
                  set(
                    f.hasMany
                      ? [...e.target.selectedOptions].map((o) => o.value)
                      : e.target.value || null,
                  )
                }
              >
                {!f.hasMany && <option value="">{t("Choose…")}</option>}
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.label)}
                  </option>
                ))}
              </select>
            ) : f.type === "checkbox" ? (
              <>
                <input
                  id={id}
                  type="checkbox"
                  checked={!!value}
                  disabled={disabled}
                  onChange={(e) => set(e.target.checked)}
                />
                {label}
              </>
            ) : (
              <input
                id={id}
                type={
                  f.type === "number"
                    ? "number"
                    : f.type === "email"
                      ? "email"
                      : f.type === "date"
                        ? "datetime-local"
                        : "text"
                }
                value={
                  f.type === "date"
                    ? value
                      ? new Date(
                          new Date(value).getTime() -
                            new Date(value).getTimezoneOffset() * 60000,
                        )
                          .toISOString()
                          .slice(0, 16)
                      : ""
                    : (value ?? "")
                }
                min={f.min}
                max={f.max}
                maxLength={f.maxLength}
                disabled={disabled}
                onChange={(e) =>
                  set(
                    f.type === "number"
                      ? e.target.value === ""
                        ? null
                        : Number(e.target.value)
                      : f.type === "date"
                        ? e.target.value
                          ? new Date(e.target.value).toISOString()
                          : null
                        : e.target.value,
                  )
                }
              />
            )}
            {f.description && (
              <p className="cms-help">
                {t(f.description.replaceAll("Payload", "CMS"))}
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}
function contentURL(
  template: string | undefined,
  siteURL: string,
  doc: any,
  locale: string,
) {
  if (!template) return null;
  const path = template
    .replaceAll("{slug}", encodeURIComponent(doc?.slug || ""))
    .replaceAll("{id}", encodeURIComponent(doc?.id || ""))
    .replaceAll("{locale}", encodeURIComponent(locale));
  const result = new URL(path, siteURL);
  return result.origin === new URL(siteURL).origin ? result.href : null;
}
export function CMSApp(props: CMSAppProps) { return <I18nProvider locale={props.uiLocale||"en"} preference={props.uiPreference||props.uiLocale||"en"}><CMSAppContent {...props}/></I18nProvider>; }
function CMSAppContent(props: CMSAppProps) {
  const {t,n,error:translateError,date,number:formatNumber}=useI18n();
  const [manifest, setManifest] = useState<any>(null),
    [module, setModule] = useState(""),
    [id, setID] = useState(""),
    [locale, setLocale] = useState(""),
    [page, setPage] = useState(1),
    [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState<any>(null),
    [data, setData] = useState<any>({}),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [history, setHistory] = useState<any>(null),
    [section, setSection] = useState(""),
    [accountOpen, setAccountOpen] = useState(false),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    void request().then(
      (m) => {
        if (!active) return;
        const q = new URLSearchParams(window.location.search);
        setManifest(m);
        setLocale(
          m.locales.includes(q.get("locale"))
            ? q.get("locale")!
            : m.defaultLocale || "",
        );
        setModule(
          m.modules.some((x: any) => x.slug === q.get("module"))
            ? q.get("module")!
            : m.modules[0]?.slug || "",
        );
        setID(q.get("id") || "");
      },
      (e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!module || !manifest) return;
    let active = true;
    setLoading(true);
    setError("");
    setHistory(null);
    const timer = setTimeout(
      () => {
        void request({
          module,
          ...(id ? { id } : {}),
          ...(locale ? { locale } : {}),
          page: String(page),
          ...(search ? { search } : {}),
        }).then(
          (result) => {
            if (!active) return;
            setLoaded(result);
            setData(
              result.doc ? editorData(result.fields || [], result.doc) : {},
            );
            setDirty(false);
            setFile(null);
            setLoading(false);
            const query = new URLSearchParams({
              module,
              ...(id ? { id } : {}),
              ...(locale ? { locale } : {}),
            });
            window.history.replaceState(null, "", "/cms?" + query);
          },
          (e) => {
            if (active) {
              setError(e.message);
              setLoading(false);
            }
          },
        );
      },
      search ? 250 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [module, id, locale, page, search, reload, manifest]);
  useEffect(() => {
    if (!dirty) return;
    const before = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  const leave = () =>
    !dirty || window.confirm(t("You have unsaved changes. Leave without saving?"));
  const navigate = (m: string, nextID = "") => {
    if (!leave()) return;
    setModule(m);
    setSection("");
    setID(nextID);
    setPage(1);
    setSearch("");
    setMessage("");
    setDirty(false);
  };
  const change = (next: any) => {
    setData(next);
    setDirty(true);
    setMessage("");
  };
  async function save(mode: string, versionID?: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body: any = {
        module,
        id,
        locale: locale || undefined,
        mode,
        updatedAt: loaded?.doc?.updatedAt ?? null,
        ...(versionID ? { versionID } : {}),
        data: editorData(loaded.fields, data),
      };
      let outgoing = body;
      if (file) {
        const form = new FormData();
        form.set("data", JSON.stringify(body));
        form.set("file", file);
        outgoing = form;
      }
      const result = await request(
        {},
        outgoing,
        mode === "delete" ? "DELETE" : "POST",
      );
      setDirty(false);
      setMessage(result.message);
      setFile(null);
      if (mode === "delete") setID("");
      else if (id === "new") setID(String(result.doc.id));
      setReload((n) => n + 1);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : msgid("The change could not be saved."),
      );
    } finally {
      setBusy(false);
    }
  }
  const editing = !!loaded?.doc;
  const topFields: CMSField[] = loaded?.fields || [];
  const separate = (f: CMSField) =>
    ["section", "group"].includes(f.type) && Boolean(f.label);
  const loose = topFields.filter((f) => !separate(f));
  const sections = [
    ...(loose.length
      ? [{ key: "general", label: msgid("Overview"), fields: loose }]
      : []),
    ...topFields.filter(separate).map((f, index) => ({
      key: f.name || `section-${index}`,
      label: f.label,
      fields: [f],
    })),
  ];
  const selectedSection =
    sections.find((item) => item.key === section) || sections[0];
  const liveURL = contentURL(
      loaded?.previewPath,
      props.siteURL,
      loaded?.doc,
      locale,
    ),
    previewURL =
      id !== "new"
        ? contentURL(
            loaded?.draftPreviewPath,
            props.siteURL,
            loaded?.doc,
            locale,
          )
        : null;
  return (
    <div className="cms-shell">
      <a className="cms-skip" href="#cms-main">{t("Skip to content")}</a>
      <aside className="cms-sidebar">
        <a
          className="cms-wordmark"
          href="/cms"
          onClick={(e) => {
            if (!leave()) e.preventDefault();
          }}
        >{"webdock"}<span>.</span> <strong>{"CMS"}</strong>
        </a>
        <button
          className="cms-account-toggle"
          type="button"
          aria-expanded={accountOpen}
          aria-controls="cms-account-links"
          onClick={() => setAccountOpen((value) => !value)}
        >{t("Account")}</button>
        <p className="cms-site-name">{props.siteName}</p>
        <nav aria-label={t("Content areas")}>
          {manifest?.modules.map((m: any) => (
            <button
              key={m.slug}
              type="button"
              aria-current={module === m.slug ? "page" : undefined}
              onClick={() => navigate(m.slug)}
            >
              {t(m.label)}
              <span>↗</span>
            </button>
          ))}
        </nav>
        <div
          id="cms-account-links"
          className={`cms-account${accountOpen ? " is-open" : ""}`}
        >
          <span>{manifest?.user.name}</span>
          <small>
            {manifest?.user.role === "operator"
              ? t("Platform administrator")
              : manifest?.user.role === "admin"
                ? t("Administrator")
                : manifest?.user.role === "editor"
                  ? t("Editor")
                  : t("Read only")}
          </small>
          <a href={props.accountURL}>{t("My account")}</a>
          {manifest?.user.role === "operator" && (
            <>
              <a href={props.accessURL}>{t("People & access")}</a>
              {props.technicalURL && (
                <a href={props.technicalURL}>{t("Advanced tools")}</a>
              )}
            </>
          )}
          <a href={new URL("/sites", props.accountURL).href}>{t("My websites")}</a>
        </div>
      </aside>
      <div className="cms-main-wrap">
        <header className="cms-topbar">
          <span>{t("Your website, in your hands.")}</span>
          <a href={props.siteURL} target="_blank" rel="noreferrer">{t("View website ↗")}</a>
        </header>
        <main id="cms-main">
          <div className="cms-heading">
            <div>
              <p className="cms-eyebrow">{props.siteName}</p>
              <h1>
                {editing
                  ? id === "new"
                    ? t("New {type}",{type:t(loaded.label)})
                    : loaded.doc.title || loaded.doc.name || t(loaded.label)
                  : loaded?.label ? t(loaded.label) : "CMS"}
              </h1>
              <p>{loaded?.description ? t(loaded.description) : t("Keep your website up to date.")}</p>
            </div>
            {manifest?.locales.length > 1 && (
              <label className="cms-language">{t("Content language")}<select
                  value={locale}
                  onChange={(e) => {
                    if (leave()) {
                      setLocale(e.target.value);
                      setDirty(false);
                    }
                  }}
                >
                  {manifest.locales.map((l: string) => (
                    <option key={l} value={l}>
                      {l === "en" ? t("English") : l === "de" ? t("German") : l}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {error && (
            <div className="cms-notice cms-error" role="alert">
              {translateError(error)}
              <button
                type="button"
                onClick={() => {
                  if (leave()) setReload((n) => n + 1);
                }}
              >{t("Reload")}</button>
            </div>
          )}
          {message && (
            <p className="cms-notice" role="status">
              {t(message)}
            </p>
          )}
          {loading ? (
            <p role="status" className="cms-loading">{t("Opening your content…")}</p>
          ) : (
            loaded &&
            (editing ? (
              <>
                <div className="cms-editor-context">
                  {loaded.kind === "collection" && (
                    <button
                      type="button"
                      className="cms-text-button"
                      onClick={() => navigate(module)}
                    >
                      {t("Back to {type}",{type:t(loaded.label)})}
                    </button>
                  )}
                  <span className="cms-status">
                    {dirty
                      ? t("Unsaved changes")
                      : loaded.drafts
                        ? loaded.doc._status === "published"
                          ? t("Published")
                          : t("Draft")
                        : t("Live content")}
                  </span>
                </div>
                {!manifest.canWrite && (
                  <p className="cms-notice">{t("You have read-only access. Contact your administrator to request editing rights.")}</p>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save(loaded.drafts ? "draft" : "save");
                  }}
                  className="cms-editor"
                  aria-busy={busy}
                >
                  {loaded.upload && (
                    <section className="cms-field-section">
                      <h2>{t("Image")}</h2>
                      {loaded.doc.url && (
                        <img
                          className="cms-upload-preview"
                          src={loaded.doc.url}
                          alt={loaded.doc.alt || ""}
                        />
                      )}
                      <label className="cms-field">
                        {id === "new" ? t("Upload image") : t("Replace image")}
                        <input
                          type="file"
                          accept="image/*"
                          disabled={!manifest.canWrite || busy}
                          onChange={(e) => {
                            setFile(e.target.files?.[0] || null);
                            setDirty(true);
                          }}
                        />
                      </label>
                    </section>
                  )}
                  {sections.length > 1 && (
                    <nav
                      className="cms-section-nav"
                      aria-label={t("Content sections")}
                    >
                      {sections.map((item) => (
                        <button
                          type="button"
                          key={item.key}
                          aria-pressed={item === selectedSection}
                          onClick={() => setSection(item.key)}
                        >
                          {t(item.label)}
                        </button>
                      ))}
                    </nav>
                  )}
                  <Fields
                    fields={selectedSection?.fields || loaded.fields}
                    data={data}
                    onChange={change}
                    readOnly={!manifest.canWrite || busy}
                    locale={locale}
                    richTextEditor={props.richTextEditor}
                  />
                  <div className="cms-savebar">
                    <div>
                      <strong>
                        {dirty
                          ? t("Ready to save?")
                          : t("Your content is up to date.")}
                      </strong>
                      <small>
                        {loaded.drafts
                          ? t("Save a draft first, then publish when ready.")
                          : t("Saving changes updates the live website.")}
                      </small>
                    </div>
                    <div className="cms-save-actions">
                      {manifest.canWrite && (
                        <button
                          type="submit"
                          className="cms-button cms-secondary"
                          disabled={busy || (!dirty && id !== "new")}
                        >
                          {busy
                            ? t("Saving…")
                            : loaded.drafts
                              ? t("Save draft")
                              : t("Save changes")}
                        </button>
                      )}
                      {manifest.canWrite && loaded.drafts && (
                        <button
                          className="cms-button"
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                t("Publish this content to the website?"),
                              )
                            )
                              void save("publish");
                          }}
                        >{t("Publish")}</button>
                      )}
                      {previewURL && (
                        <a
                          className="cms-button cms-secondary"
                          href={previewURL}
                          target="_blank"
                          rel="noreferrer"
                        >{t("Preview saved draft ↗")}</a>
                      )}
                      {liveURL && (
                        <a
                          className="cms-text-button"
                          href={liveURL}
                          target="_blank"
                          rel="noreferrer"
                        >{t("View live ↗")}</a>
                      )}
                    </div>
                  </div>
                </form>
                {loaded.versions && id !== "new" && (
                  <section className="cms-history">
                    <button
                      className="cms-text-button"
                      type="button"
                      onClick={() =>
                        void request({
                          module,
                          id,
                          locale,
                          operation: "versions",
                        }).then(setHistory, (e) => setError(e.message))
                      }
                    >{t("Version history")}</button>
                    {history?.docs.map((v: any) => (
                      <div key={v.id}>
                        <span>
                          {date(v.updatedAt||v.createdAt,{dateStyle:"medium",timeStyle:"short"})}{" "}
                          · {v.status === "published" ? t("Published") : v.status === "draft" ? t("Draft") : t("Saved")}
                        </span>
                        {manifest.canDelete && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  t("Restore this version? This replaces the current content."),
                                )
                              )
                                void save("restore", String(v.id));
                            }}
                          >{t("Restore")}</button>
                        )}
                      </div>
                    ))}
                  </section>
                )}
                {manifest.canDelete &&
                  loaded.kind === "collection" &&
                  id !== "new" && (
                    <details className="cms-danger">
                      <summary>{t("Delete this content")}</summary>
                      <p>{t("This removes the record. Images may still be used by other content.")}</p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(t("Permanently delete this record?")))
                            void save("delete");
                        }}
                      >{t("Delete permanently")}</button>
                    </details>
                  )}
              </>
            ) : (
              <>
                <div className="cms-list-toolbar">
                  <label className="cms-search">{t("Search")}<input
                      type="search"
                      value={search}
                      placeholder={t("Find {type}",{type:t(loaded.label)})}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                    />
                  </label>
                  {loaded.canCreate && (
                    <button
                      type="button"
                      className="cms-button"
                      onClick={() => navigate(module, "new")}
                    >
                      {loaded.upload ? t("Upload image") : t("Create new")} +
                    </button>
                  )}
                </div>
                <div
                  className={
                    loaded.upload ? "cms-media-grid" : "cms-record-list"
                  }
                >
                  {loaded.docs?.map((doc: any) => (
                    <button
                      className="cms-record"
                      key={doc.id}
                      onClick={() => navigate(module, String(doc.id))}
                    >
                      {loaded.upload && doc.url && (
                        <img
                          src={doc.sizes?.thumbnail?.url || doc.url}
                          alt=""
                        />
                      )}
                      <div>
                        <h2>
                          {(loaded.titleField === "id"
                            ? t("{type} #{id}",{type:t(loaded.label),id:doc.id})
                            : doc[loaded.titleField]) ||
                            doc.title ||
                            doc.name ||
                            doc.filename ||
                            t("Item {number}",{number:doc.id})}
                        </h2>
                        <p>
                          {doc._status
                            ? doc._status === "published"
                              ? t("Published")
                              : t("Draft")
                            : loaded.upload
                              ? t("Image")
                              : t("Content")}
                          {doc.updatedAt &&
                            ` · ${date(doc.updatedAt)}`}
                        </p>
                      </div>
                      <span aria-hidden="true">↗</span>
                    </button>
                  ))}
                </div>
                {!loaded.docs?.length && (
                  <div className="cms-empty">
                    <h2>
                      {search
                        ? t("No matching content")
                        : t("Make room for your next idea.")}
                    </h2>
                    <p>
                      {search
                        ? t("Try another search.")
                        : t("Create your first item to get started.")}
                    </p>
                  </div>
                )}
                <nav className="cms-pagination" aria-label={t("Content pages")}>
                  <span>{n("{count} item","{count} items",loaded.totalDocs||0)}</span>
                  <button
                    type="button"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >{t("Previous")}</button>
                  <span>
                    {formatNumber(page)} / {formatNumber(Math.max(1,loaded.totalPages||1))}
                  </span>
                  <button
                    type="button"
                    disabled={page >= loaded.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >{t("Next")}</button>
                </nav>
              </>
            ))
          )}
        </main>
        <footer className="cms-footer">{t("CMS by Webdock")} <span>{t("Content and access, kept in your control.")}</span>
        </footer>
      </div>
    </div>
  );
}
