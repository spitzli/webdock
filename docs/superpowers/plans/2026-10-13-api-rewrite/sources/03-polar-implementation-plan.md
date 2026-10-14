# Webdock Polar Billing Implementation Plan

> **For agentic workers:** Für die Ausführung `superpowers:executing-plans` oder nach explizit gewählter Delegation `superpowers:subagent-driven-development` verwenden. Dieser Plan ist noch nicht implementiert.

**Goal:** Eigene Produkte und private Angebote im Studio verwalten, über Polar verkaufen und bestätigte Abos zuverlässig in Webdock-Leistungen übersetzen.

**Architecture:** Billing-Modul im neuen selbst gehosteten `apps/api`; Studio als HTTP-Frontend. PostgreSQL/Drizzle speichert Katalog, Verträge, Providerprojektionen, Webhook-Eingänge und Jobs. Ein eigener Worker verarbeitet Ereignisse; Dragonfly beschleunigt nur rekonstruierbare Reads.

**Tech Stack:** Bun/Elysia-FSR und Drizzle v1 gemäß [API-Rewrite-Plan](#file-01-api-rewrite-plan-md); `@polar-sh/sdk@1.0.2`, API `2026-10`; bestehende Better-Auth-Identitäten und Planverträge.

**Spec:** [2026-10-13-polar-billing-design.md](#file-02-polar-design-md). Diese Datei und der API-Rewrite-Plan sind vor Ausführung gemeinsam zu lesen. Der Nutzer hat den früheren Vercel-Backendvorschlag ausdrücklich durch Selfhosting ersetzt.

## Globale Bedingungen

- Live-URL: `https://api.webdock.dev/webhooks/polar`; Sandbox: `/webhooks/polar/sandbox`.
- Keine neue Backendlogik in `apps/auth` oder `apps/admin` implementieren. Bestehende Pfade sind Migrationsquellen.
- Auth-/Mandanten-/Planservices und Job-/Secret-Grundlage aus Rewrite-Phasen 1–4 müssen vor ihren Billing-Abhängigkeiten verfügbar sein.
- Ein Kunde entspricht einer Polar-Customer-Zuordnung je Umgebung. Login-Nutzer, E-Mail und Polar-Organisation sind keine Mandanten-ID.
- Preise als Integer-Unterwerte; exakte Preis-/Steuer-/Intervall-/Leistungsversion. Erste Produkte EUR/Jahr, keine Trials/Rabattcodeeingabe.
- Sandbox verändert keine produktiven Planprojektionen oder Providerressourcen.
- Zuerst maximal ein Website-Basisabo je Kunde; parallele Familien/Add-ons erst nach eigener abgenommener Aggregationslogik.
- Neue Funktionen standardmäßig deaktiviert; Bestandskunden bleiben manuell, bis ein ausdrücklich angenommener Wechsel bestätigt ist.
- Keine generische automatische Wiederholung unklarer Providerwrites. Geld- und Ressourcenstatus bleibt in PostgreSQL, nie ausschließlich Dragonfly.
- Vorhandene freie/manuelle Angebote weiter unterstützen; eine Operatorzuweisung ist keine Kundenannahme und keine Zahlung.

## Review-Fokus

1. Zwei gleichzeitige Käufe/Worker/Events erzeugen keinen zweiten Vertrag oder doppelte Kontingente.
2. Auszahlung/Erstattung/Kündigung nach Ablauf eines Angebots wird zugeordnet und bearbeitet, nicht ignoriert.
3. Sandbox, anderer Tenant, andere Polar-Organisation und Operator-Kundenansicht können keine Livezahlung oder fremden Zugriff auslösen.
4. API-/Cacheausfall und verspäteter Status setzen Rechte nicht auf null und verlängern sie nicht blind.
5. Bestands-Extras, bisherige manuelle Pläne und bestehende CMS-Sessions verhalten sich nach dem Billing-Cutover korrekt.

## Datei- und Schnittstellenkarte

| Datei/Gruppe, neu sofern nicht anders markiert | Aufgabe |
|---|---|
| `apps/api/src/db/schema/billing.ts`, `apps/api/drizzle/*` | Tabellen/Constraints aus Spezifikation, additive Migration |
| `apps/api/src/modules/billing/types.ts` | Gemeinsame Domänentypen/DTOs, keine Secrets |
| `.../connection.ts`, `.../polar.ts` | Operator-Konfiguration, versionierter SDK-Client |
| `.../catalog.ts` | Produktversionen, Veröffentlichung, Drift-Abgleich |
| `.../checkout.ts`, `.../offers.ts` | Annahme, reservierter Versuch, Zuordnung |
| `.../webhooks.ts`, `.../reconcile.ts` | Persistenter Eingang, Provider-Abgleich |
| `.../entitlements.ts` | Absolute Leistungsprojektion und Zugangsstatus |
| `.../subscriptions.ts`, `.../portal.ts` | Kündigung, Wechsel, Portal-Session |
| `apps/api/src/protocols/webhooks/polar.ts` | Zwei getrennte Raw-Body-Eingänge, explizit gemountet |
| `apps/api/src/routes/{tenant,operator}/billing/` | Statisch geschützte Operator-/Kundenbäume, Präfixe aus `app.ts` |
| `apps/api/src/worker.ts`, `jobs.ts` — erweitern | Dauerhafte Ausführung, Scheduler, Fristen |
| `apps/api/src/modules/{auth,plans,access,lifecycle}/` — erweitern | Rechte, Planrevisionen, History und Löschschutz |
| `apps/admin/src/app/(console)/(portal)/admin/billing/` | Verbindung/Webhooks/Betrieb, page/form/actions |
| `apps/admin/src/app/(console)/(portal)/admin/products/` | Katalog/Version/Veröffentlichung, page/form/actions |
| `apps/admin/src/app/(console)/(portal)/tenants/[customerID]/billing/` | Kundenabrechnung, page/form/actions |
| Bestehende `offers/[token]/{page,form,actions}.tsx/.ts` | Bezahlte Annahme/Weiterleitung und Status |
| `packages/api-client`, `packages/i18n` — erweitern | DTO-Client und deutsche/englische Meldungen |

Die genauen Routen-/Clientdateien folgen dem im API-Rewrite abgenommenen Vertrag. Domänendienste dürfen nicht vom Frontend oder einem Polar-SDK-Typ als öffentlichem API-Vertrag abhängen.

Vorgesehene Dienste (konkrete Namen für die Arbeitsaufteilung):

```ts
type BillingEnvironment = "sandbox" | "live";
type BillingActor = { userID: string; sessionID: string };
type BillingReceipt = { operationID: string; status: "pending" | "ready" | "needs_review" };
type CheckoutResult = BillingReceipt & { checkoutURL?: string };

// Umsetzung in den jeweils benannten Modulen; alle Actor-Daten serverseitig erzeugen.
// getConnectionStatus(actor, env), saveConnection(actor, env, input)
// publishProductVersion(actor, env, versionID, expectedRevision): Promise<BillingReceipt>
// createCheckout(actor, env, contractID): Promise<CheckoutResult>
// receiveWebhook(env, request): Promise<Response>
// reconcileCustomer(env, customerID): Promise<void>
// projectEntitlements(env, customerID): Promise<void>
// createPortalSession(actor, env, customerID): Promise<{ url: string }>
```

## Arbeitspaket 1 — Schema, Testmandanten und Transaktionsregeln

**Dateien:** DB-Schema/Migration, Billingtypen, `apps/api/tests/billing-schema.test.ts`, `apps/api/tests/helpers/billing.ts`.

- [ ] Schema aus Spezifikation in Drizzle abbilden; Unique-Constraints für Umgebung + externe IDs sowie aktive Website-Vertragsbindung hinzufügen.
- [ ] Lokale Testfixture mit zwei Kunden, Operator, Kundenadmin, normalem Member und getrenntem Sandboxmandanten anlegen. Helpers erzeugen nur `.invalid`-Identitäten in der geprüften lokalen Wegwerf-DB.
- [ ] Migration zuerst gegen Bestandsstruktur und dann zweimal gegen frische Teststruktur prüfen. Fehler müssen sauber abbrechen; keine halbe Migrationsmarkierung.
- [ ] Tests für doppelte Mapping-ID, aktive Doppelbindung, nicht ganze Geldbeträge, unzulässige Währung, FK-Löschung und gleichzeitige Claims schreiben.
- [ ] Datenmodell mit dem vorhandenen Plan-Autor prüfen: Geldstatus und Kontingentstatus bleiben getrennt.

**Abnahme:** FK/Unique-Regeln verhindern Cross-Tenant-/Cross-Environment-Zuordnung; produktive Bestandspläne bleiben unverändert. Keine automatisch ausgeführte Migration beim API-Start.

## Arbeitspaket 2 — Operator-Verbindung und Secretverwaltung

**Dateien:** `connection.ts`, `polar.ts`, API-Operatorrouten, Studio `/admin/billing`, `billing-connection.test.ts`.

- [ ] Operator-/MFA-/Preview-Negativtests vor der Oberfläche schreiben; Session-/Rollenentzug muss beim nächsten Aufruf greifen.
- [ ] Getrennte Umgebungskonfiguration, feste Hostziele, Organisationsbindung und zweckgebundene verschlüsselte Credentials implementieren.
- [ ] Versionierten SDK-Client mit explizitem Timeout bereitstellen; SDKfehler auf überprüfte öffentliche Meldungen abbilden.
- [ ] Verbindung prüfen, maskierten Status, drei Betriebsschalter und Secretrotation implementieren.
- [ ] Aus UI-/API-/Auditantworten nachweisen, dass Token/Secrets nie im Klartext zurückkommen.

SDK-Vertrag für den Kompatibilitätstest:

```ts
import { createPolar, webhooks } from "@polar-sh/sdk/2026-10";
const client = createPolar({ accessToken: fixtureToken, environment: "sandbox" });
const verified = await webhooks.validateEvent(rawBody, signedHeaders, fixtureSecret);
```

Fixturewerte werden ausschließlich lokal erzeugt. Bei Ausführung aktuelle Pakettypen mitprüfen; dieses Beispiel bestätigt keine bereits erfolgte Verbindung.

**Abnahme:** Falsche Organisation wird nicht gespeichert, Tokenwechsel ist auditierbar, deaktivierter Verkauf stoppt keine bestehenden Webhook-/Kündigungsabläufe.

## Arbeitspaket 3 — Katalog und Veröffentlichung

**Dateien:** `catalog.ts`, Katalogrouten/-UI, `billing-catalog.test.ts`.

- [ ] Drei Websiteversionen als Entwürfe mit exakten Centbeträgen/Leistungen erfassen. Kein automatischer Live-Seed beim Deploy.
- [ ] Veröffentlichungsoperation reservieren, API-Create außerhalb Transaktion ausführen, Readback/Hash speichern.
- [ ] Erneuter Klick liefert bestehenden Zustand. Unklarer Timeout bleibt `needs_review`; paginierter Metadatenabgleich statt neuem Create.
- [ ] Neue kommerzielle Versionen, Archivierung und Drift-Anzeige implementieren. Alte Subscriptionversionen behalten ihren Preis/Leistungsumfang.
- [ ] Tests mit Timeout nach erfolgreichem Providercreate, doppeltem Metadatentreffer, fremdem Produkt und Provideränderung ergänzen.

Beispiel des erwarteten ProductCreate-Bodys für den Providervertrag:

```json
{
  "name": "Website Mini · jährlich",
  "recurring_interval": "year",
  "recurring_interval_count": 1,
  "prices": [{ "amount_type": "fixed", "price_amount": 5880, "price_currency": "eur", "tax_behavior": "inclusive" }],
  "metadata": { "webdock_sku": "website-mini-year-v1", "webdock_version_id": "fixture-version" }
}
```

**Abnahme:** Produkt ist erst nach übereinstimmendem Polar-Readback buchbar; Varianten nach Intervall getrennt; Sandbox-/Live-IDs werden nicht vermischt.

## Arbeitspaket 4 — Webhook-Eingang und Endpointverwaltung

**Dateien:** `webhooks.ts`, explizit gemountete Live-/Sandbox-Protokollrouten, Operator-Endpointaktionen, `billing-webhooks.test.ts`.

- [ ] Elysia-Rohbodyverhalten testen und automatische Parser für diesen Pfad deaktivieren/umgehen. Signierte Testbytes inklusive Unicode/Whitespace dürfen nicht geändert werden.
- [ ] 1-MiB-Streaming-Limit, Signatur/Zeittoleranz, Version, Umgebung und durable Inbox-Transaktion implementieren.
- [ ] Tests: gültig, falsches Secret, falsche Umgebung, zu alter Timestamp, abgeschnittener Body, zu groß ohne Content-Length, DB-Ausfall, Duplikat und widersprüchlicher Bodyhash.
- [ ] „Endpoint anlegen/übernehmen“ mit festem URL-/Event-/Versionsvertrag und verschlüsseltem zurückgegebenem Secret implementieren.
- [ ] Tatsächlichen Empfang getrennt von Verbindungsprüfung anzeigen; Import unbekannter aktiver Endpoints erzeugt keine automatische Umkonfiguration fremder Webhooks.

**Abnahme:** 202 erst nach persistiertem Event + Job; keine Providerqueries im Eingang. API-/Workerneustart verliert bereits quittierte Ereignisse nicht.

## Arbeitspaket 5 — Worker und aktueller Providerzustand

**Dateien:** `reconcile.ts`, `jobs.ts`, Workerregistrierung, `billing-reconcile.test.ts`.

- [ ] Jobclaims mit Lease/Claim-Token und Compare-and-set implementieren; verlorene Worker dürfen neuere Arbeit nicht abschließen.
- [ ] Aktuellen Customer-/Subscription-/Orderstatus laden; Organisation, Kundenbindung, Vertrag, Betrag/Währung und Produktzuordnung validieren.
- [ ] Pro Kunde Abgleichgeneration serialisieren, unvollständige Pagination abweisen, DTO/Status atomar schreiben.
- [ ] Retry/429/Backoff, Quarantäne und manuelles Retry implementieren; ungeklärte Writes nie als Reads wiederholen.
- [ ] Periodischen vollständigen Abgleich und lokale Fristen registrieren, Kennzahlen/Fehlerstatus für Operatorbereich liefern.

**Tests:** Active-Event nach Kündigung, zwei gleichzeitig abgeschlossene Reads, Crash nach Fetch vor Commit, API-503, 429, Kunde fehlt in Teilseite, fremde Organisation, eine bezahlte Order ohne Webdock-Vertrag.

**Abnahme:** Ereignisreihenfolge kann keinen älteren Status zurückschreiben; Cacheverlust beeinflusst Dedupe/Verträge nicht.

## Arbeitspaket 6 — Standardkauf und private Angebote

**Dateien:** `checkout.ts`, `offers.ts`, Kunden-/Angebots-UI, `billing-checkout.test.ts`, bisherige Plan-Angebotstests übernehmen.

- [ ] Explizite Annahme und unveränderlichen Vertragssnapshot speichern; kundenfremde/abgelaufene/veraltete Angebote abweisen.
- [ ] Bereite Websitebindung und einen aktiven Basisvertrag je Kunde prüfen. Bestehende manuelle Leistungen vor Bestätigung nicht ersetzen.
- [ ] Checkoutversuch reservieren; festes Produkt, Preis, Währung, externe Kunden-ID und kanonische Rücksprungziele senden.
- [ ] Doppelklick-/Timeoutverhalten, Statusseite und serverseitige Erfolgskontrolle implementieren.
- [ ] Private feste Ad-hoc-Preise in Sandbox bis in die Subscription und Verlängerung prüfen. Wenn nicht nachgewiesen: eigenes privates Produkt aus Angebotssnapshot, weiterhin kein öffentlicher Templateeintrag.
- [ ] Ablauf/Rückzug eines bereits gestarteten Checkouts transparent abbilden; bezahlter Konflikt landet beim Operator, ohne stillen Geld-/Leistungsverlust.

**Tests:** falscher Tenant, Member, Operatorvorschau, manipulierte Preise/Return-URL, zwei Klicks, absichtlich langsamer Provider, Zahlung vor API-Antwort, Zahlung nach Angebotsfrist und manuelle Planänderung während Checkout.

**Abnahme:** Erfolgs-URL allein aktiviert nichts; jeder Geldvorgang ist einem eingefrorenen Kundenvertrag zugeordnet oder sichtbar in Prüfung.

## Arbeitspaket 7 — Leistungen und Bestandskompatibilität

**Dateien:** `entitlements.ts`, zentrale Authclaims/Planservice, `billing-entitlements.test.ts`, bestehende Plan-/SSO-Tests.

- [ ] Reine Zustandsfunktion für Aktivierung/Schonfrist/Sperre und Snapshotprojektion testen; Uhr injizieren.
- [ ] Erstkauf nur aus passendem aktiven Abo mit bestätigter Erstorder aktivieren. Periodenwechsel allein ist kein Zahlungserfolg.
- [ ] Absolute Basiszuteilung unter bestehendem Planlock schreiben, manuelle Extras bewahren und Revision nur bei wirksamer Änderung erhöhen.
- [ ] Nur gebundene bezahlte Website bei endgültiger Sperre aus Kundenclaims ausschließen. Operator und Studio-Zahlungszugang erhalten.
- [ ] Modus `manual/sponsored` unverändert lassen; Live-Migration eines Altplans explizit dokumentieren, Ende eines Abos reaktiviert ihn nicht automatisch.
- [ ] Sandboxprojektion in getrennten Testdaten nachweisen; produktive Plan-/Hostingtabellen dürfen keine Sandboxupdates sehen.

**Tests:** doppelte Events, 7-Tage-Grenze, Zahlung nach Rückstand, Teilrefund, Kündigung zum Periodenende, endgültiger Widerruf, APIausfall vor zeitlicher Sperre, aktiver CMS-Tab nach Rechteentzug, mehrere unabhängige manuelle Extras.

**Abnahme:** Gleicher bestätigter Zustand erzeugt gleiche Kontingente; keine Datenlöschung/öffentliche Siteabschaltung durch einen Billingwebhook.

## Arbeitspaket 8 — Portal, Kündigung und Tarifwechsel

**Dateien:** `portal.ts`, `subscriptions.ts`, Kunden-Billing-UI, `billing-subscriptions.test.ts`.

- [ ] Kurzlebige Polar-Portal-Session nur für aktuellen Kundenadmin und gespeicherte Zuordnung erzeugen; nicht cachen/loggen.
- [ ] Status/Belege/Rhythmus/Fälligkeit/Kündigung anzeigen. Operator erhält Link zur betreffenden Polar-Order für Refunds.
- [ ] Portalsettings prüfen: Produktwechsel, Seats und Pause zunächst aus; Zahlungsmittel/Rechnungen/Kündigung verfügbar.
- [ ] Upgrade/Downgrade auf bestehender Subscription mit expliziter Proration implementieren; einen zweiten Checkout für bereits bezahltes Abo ablehnen.
- [ ] Pending-Update, Zahlungsfehler, unbekanntes Updateergebnis und überbelegten Downgrade als sichtbare Zustände behandeln.

**Tests:** Portal-ID-Manipulation, fremder Kunde, Vorschau, abgelaufene Sitzung, sofortiges Upgrade bezahlt/fehlgeschlagen, Downgrade nächste Periode, Kündigung rückgängig, Refund ohne Kündigung.

**Abnahme:** Polarzustand und lokale Wirkung stimmen überein, keine versteckte Zweit-Subscription, kein Verlust des Bezahlzugangs.

## Arbeitspaket 9 — Abnahme und Pilotrollout

**Dateien:** `infra/api`-Deploymentkonfiguration, Betriebsdokumentation und `docs/verification/2026-10-13-polar-billing.md` erst mit echten Ergebnissen erstellen.

- [ ] Isolierte DB-/HTTP-/Worker-Tests, Typecheck, Lint der Änderungen und reproduzierbaren API-/Frontendbuild ausführen.
- [ ] Browser-E2E mit Sandbox: Operator konfiguriert → Produkt veröffentlicht → Kundenadmin kauft → Webhook → Kontingent → CMSzugriff → Kündigung → erneuter Abgleich.
- [ ] Cache/Worker/API nacheinander stoppen und Wiederanlauf prüfen; Portalzugriff nach Zahlungsausfall nachweisen.
- [ ] Raw-Body über echten TLS-Ingress, Secretrotation, negative Hosttests und Empfangslatenz messen.
- [ ] Tatsächliche Polarorganisation/Steuer-/Gebühren-/Produktfreigabe prüfen, Livebetrieb mit Verkauf aus aktivieren.
- [ ] Konkreten Katalogdiff reviewen, einen Pilotvertrag ausdrücklich annehmen lassen, Gegenprüfung bei Polar/Webdock und Monitoring durchführen.
- [ ] Verkauf erst danach öffnen; alte Kunden nicht automatisch migrieren. Rollback erhält Inbox, Worker, Kündigungen und Finanzbelege.

**Abnahme:** Verifikationsdatei trennt ausgeführte Tests, echte Sandbox, Livebeobachtung und offene Punkte. Keine ausgedachten Bestands-/Gebühren-/Verfügbarkeitsnachweise.

## Anschluss nach dem ersten Release

Alle Gist-Produktlinien passen in den Katalog, aber ihre Freigabe ist eigenständig:

- Mehrere Websites/Add-ons: mehrere Vertragsquellen, je Site Editorrechte, additive Mengen, Parent-Vertrag und saubere Kündigung.
- Apps/Bots: Kapazität und Containerbetrieb, Reservierung durch Zahlungsversuch hindurch, Erfüllungs-/Refundfall bei Ressourcenverlust.
- Mail: globales Poolbudget, Providerperioden und verifizierte Quotenänderung; Ersatz vs. Zusatzmenge ausdrücklich modellieren.
- Connect: korrekt gezählte Verbindungen und Softwareberechtigungen, Providerkosten beim Kunden.
- DB/Mailboxen: Betrieb/Backup/Restore zuerst abnehmen.
- Menschliche Entwicklung, Einrichtung und Pflege: separate manuelle Rechnung; kein Polarprodukt zur Umgehung der AUP.

Diese Erweiterungen sind nicht implizit durch ein vorhandenes Product-ID-Mapping fertig. Für jede neue Familie werden Leistungsschema, Kapazitäts-/Quotaadapter, Fehler-/Kündigungsfall und Sandboxabnahme vor Verkaufsfreigabe ergänzt.
