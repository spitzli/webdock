# Webdock: Self-hosted API-Rewrite + Polar — Agentenübergabe

Stand: 13.10.2026. Secret Gist: nicht öffentlich gelistet, aber jeder mit dem Link kann es lesen. Enthält Architektur, Recherche und Arbeitsplanung; keine Zugangsdaten und keine bereits durchgeführte Migration.

## Festgelegtes Ziel

Das vollständige Backend von Studio und Auth geht in eine selbst gehostete API unter `api.webdock.dev`. Studio und Auth bleiben Oberflächen. Startstack: Bun + Elysia + [deadlinecode/elysia-fsr](https://github.com/deadlinecode/elysia-fsr), Drizzle v1 und eigener privater Dragonfly-Cache. Polar wird dort integriert; Webdock führt Produkte und Leistungen, Polar führt Zahlungen und tatsächliche Abos.

Der frühere Zwischenvorschlag, die API als Domainalias des bestehenden Vercel-Backends zu betreiben, ist durch diese Nutzervorgabe ersetzt. Kein neuer API-Service auf Vercel planen.

## Lesen in dieser Reihenfolge

1. [API-Rewrite: Recherche, Architektur, Migration und Abnahme](#file-01-api-rewrite-plan-md)
2. [Polar: Produktmodell, Operator-Settings, Datenmodell und Zustandsregeln](#file-02-polar-design-md)
3. [Polar: neun abhängige Umsetzungsarbeitspakete](#file-03-polar-implementation-plan-md)
4. [Vertiefter FSR-Prüfbericht mit reproduzierten Fällen](#file-04-elysia-fsr-review-md)
5. `05-elysia-fsr-probe.ts`: optionale lokale Reproduktion, im Root einer isolierten Kopie des geprüften FSR-Commits ausführen; siehe Prüfbericht.

Quellrepository im Arbeitsbereich: `/home/newt/Projekte/Personal/spitzli/webdock`, Ausgangscommit `73733b0` mit vielen bereits vorhandenen uncommitteten Änderungen. Neuere Produktionsstände sind anhand des lokalen Checkouts allein nicht vollständig bekannt. Nicht resetten oder fremde Änderungen überschreiben.

Vorheriges Produktinventar: [Gist vom 12.10.2026](https://gist.github.com/1fe6c0c0da211f06c0784114afef450c). Website Mini/Basic/Plus sind Zielangebote, keine bereits veröffentlichten Preise. Apps/Bots, Connect/BYOK, Mail, Datenbanken und Dienstleistungen sind darin getrennt beschrieben.

## Wesentliche Recherchebefunde

- Drizzle v1 ist derzeit **Release Candidate `1.0.0-rc.4`**, sowohl ORM als auch Kit. Nicht als Stable oder als `latest` ausgeben.
- Elysia-FSR ist **`0.1.0`**. Routen werden zur Laufzeit aus Dateien geladen; Importfehler können protokolliert werden, während andere Routen starten. Daher Startabbruch bei fehlenden/kaputten Pflichtmodulen, Guardtests und reproduzierbare Typgenerierung einplanen.
- Eigener Dragonfly ist sinnvoll für rekonstruierbare Caches. Sessions, Rollen, Billing, Dedupe, Ressourcenreservierungen und Jobs bleiben zunächst in PostgreSQL. Kein automatisches Better-Auth-`secondaryStorage` einschalten.
- Studio besitzt heute einen echten Payload-Backendanteil. Hooks, Ownership, Audit und Archiv-/Löschregeln müssen mitmigriert werden; ein Umbenennen von Next-API-Routen reicht nicht.
- Der Auth-Backendprozess zieht um; der öffentliche OIDC-Issuer und die Passkey-RP-ID `auth.webdock.dev` bleiben zunächst stabil. Auth-/Studio-Backendpfade werden gezielt zum API-Service geroutet.
- `api.webdock.dev` zeigt aktuell auf `178.104.141.95` und liefert ein selbstsigniertes Traefik-Default-Zertifikat. Der Nutzer bestätigt: **kein genutzter API-Dienst dahinter**. Zielhost/Ressourcen prüfen, TLS korrekt einrichten; keine ungefragte DNSumschaltung zu Vercel.
- Geplante Polar-Live-Webhook-URL: `https://api.webdock.dev/webhooks/polar`. Noch nicht implementiert/empfangsbereit.
- **Nachtrag:** Abschnitt 7a des API-Plans legt jetzt Middleware-Reihenfolge, Plugin-Scopes, Ausnahmen für Auth/Webhooks/MCP und negative Zugriffstests fest. Statische Parent-Guards ersetzen Ghost-Dateien als Sicherheitsgrenze.

## Startauftrag für den neuen API-Rewrite-Planungsagenten

Diesen Block zusammen mit dem Gist-Link verwenden:

> Arbeite im Webdock-Repository als API-Rewrite-Planungsagent. Lies zuerst die Planungsdateien und den FSR-Prüfbericht dieses Gists und die lokalen AGENTS.md-/RTK-Vorgaben. Ziel ist ein vollständig selbst gehostetes Backend in apps/api mit Bun, Elysia-FSR, Drizzle v1 und privatem Dragonfly. Studio und Auth werden UI mit dünnem HTTP-Transport; keine Datenbank-, Provider- oder Auth-Geschäftslogik bleibt dort. Die bestehenden Kunden-CMS und der Python-Hosting-Agent werden nicht neu geschrieben.
>
> Prüfe das gesamte heutige Backend von apps/admin und apps/auth, einschließlich Payload-Hooks, Next-Server-Actions, versteckter .well-known-Routen, SSO/Passkeys/MFA/OIDC/MCP, Mail, Hosting, Provider-OAuth, CMS-Bridges, Lifecycle und Jobs. Gleiche Quell- und produktiven Release-Stand ab. Bewahre fremde uncommittete Änderungen. Trenne belegte Fakten, Architekturentscheidungen und noch zu prüfende Annahmen.
>
> Erstelle einen datei- und testgenauen Ausführungsplan in kleinen vertikalen Schritten. Liefere Routen-/Autorisierungsmanifest, Schema-/Migrationseigentum, Secret- und Cachekonzept, Cutoverreihenfolge, explizite Betriebs-/Rollbackregeln sowie Abnahmetests. Erhalte zunächst Auth-Issuer, Passkey-RP-ID, Host-only-Cookies, Snowflake-IDs, SQL-Constraints/Trigger/Locks und bestehende Kundenvereinbarungen. Drizzle v1 ist aktuell RC; Elysia-FSR braucht die dokumentierten Start-/Routingtests. Kein Dual-Write ohne ausdrücklich definierten Besitzer.
>
> Nimm Polar als abhängiges Billingmodul auf: Operator-Konfiguration, Katalogpublikation, private Angebote, Checkout, signierte Webhooks, dauerhafte Inbox/Jobs, Reconciliation, lokale Leistungsprojektion und Kundenportal. Verwende die mitgelieferten Status-/Fehlerregeln. Keine Livepreise, Kundenabos oder Infrastruktur allein durch diese Planung verändern.
>
> Starte mit Bestandsanalyse und Plan. Implementiere oder deploye noch nichts. Suche benötigte Informationen möglichst im Repository und in offiziellen aktuellen Quellen; frage nur Entscheidungen ab, die sich nicht daraus ableiten lassen. Endergebnis ist ein reviewbarer Plan, mit dem anschließend ein Implementierungsagent arbeiten kann.

## Was bereits getan wurde

Repository und Produkt-Gist gelesen; offizielle Polar-, Elysia-/FSR-, Drizzle-, Better-Auth-, Bun- und Dragonfly-Quellen geprüft; npm-Dist-Tags und ausgewählte Paket-/Quelltexte gelesen; öffentliche DNS-/TLS-Stichprobe gemacht; diese Planungsdateien erstellt.

Nachträglich ausgeführt: isolierte FSR-Quellcodeprüfung, 11 bestehende Runtime-Tests plus Typecheck und gezielte Reproduktionen unter Bun 1.4.3/Elysia 1.4.30. Details und Grenzen stehen im Prüfbericht.

Nicht durchgeführt: Produktimplementierung, vollständiger Stack-/Middlewareprototyp, DB-Migration, Dragonflyinstallation, Secrets setzen, Polar-Sandboxkauf, Kundenänderung, Deployment oder DNSmutation. Die übrigen Tests im Plan sind weiterhin Abnahmeanforderungen, keine behaupteten Testergebnisse.
