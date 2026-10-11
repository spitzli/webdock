# Stalwart: Funktionsprüfung für Webdock

Recherchestand: 10. Oktober 2026. **Entscheidung:** CE pro Mandant mit aktiviertem E-Mail-Dienst; siehe [verbindliche Zuordnung](mail-deployment-decision.md). Ergänzung zum [Webdock-Mail-Konzept](../superpowers/specs/2026-10-10-webdock-mail-design.md) und zum [Umsetzungsfahrplan](../superpowers/plans/2026-10-10-webdock-mail.md).

Geprüft wurden die Produkt-/Editionsübersichten, die vollständige RFC-/Erweiterungsliste sowie die für Webdock relevanten Protokoll-, Collaboration-, Identitäts-, Speicher- und Betriebsbeschreibungen. Das Dokumentationsinventar umfasst 341 allgemeine Dokumentationsseiten außerhalb der generierten Objektreferenz. Die wichtigen Bereiche wurden vertieft gelesen; dies ist keine Behauptung, jeden API-Parameter oder die Protokollimplementierung im Quellcode geprüft zu haben. Kein Live-Interoperabilitätstest wurde durchgeführt.

Die Tabellen trennen dokumentierte Stalwart-Fähigkeiten von unseren Produktentscheidungen. Die aktuelle Website kann weiter sein als ein installiertes Release. `v0.16.25` ist der bei der Recherche gefundene Prüfkandidat für den Integrationstest; Fähigkeiten müssen danach gegen dessen tatsächliche JMAP-Session, Schema, Edition und Verhalten bestätigt werden.

## 1. Konsequenz für die Architektur

Stalwart eignet sich als gemeinsame Grundlage für **Mail, Kalender, Kontakte und private Dateien**. Die Dienste teilen Identitäten, Berechtigungen und Speicherverwaltung. Webdock sollte diese Fähigkeiten über eigene Produktmodule anbieten, anstatt Kalender oder Adressbücher später in einer zweiten Datenbank nachzubauen. [Collaboration-Übersicht](https://stalw.art/docs/collaboration/)

Empfohlene Aufteilung:

- **Erstes Kundenrelease:** Webdock Mail mit Versand-API, SMTP, Postfächern, Webmail und Weiterleitungen. Rechte, Discovery, Quotas und Backupdesign berücksichtigen die zusätzlichen Dienste bereits.
- **Erste fachliche Erweiterung:** Webdock Kontakte und Kalender, über JMAP im Browser sowie CardDAV/CalDAV in Geräten. Als eigener lieferbarer Ausbau planen; die jetzige Rechercheanweisung allein verschiebt den zugesagten Mailumfang nicht.
- **Später optional:** private WebDAV-Dateien, zusätzliche Enterprise-Provisionierung, Masked Email und weitergehende Automatisierung.

Nicht freigegebene Module werden in Stalwart **über beide Protokollfamilien** gesperrt. Nur einen Menüpunkt oder `/dav` zu verstecken verhindert keinen Zugriff über JMAP.

## 2. Mailprotokolle und native Oberfläche

| Fähigkeit | Dokumentierter Stand | Entscheidung für Webdock |
| --- | --- | --- |
| SMTP / Submission / LMTP | Empfang, authentifizierter Versand, lokale Übergabe, Erweiterungen für MIME/DSN/TLS | SMTP ist gemeinsame verwaltete Grenze; LMTP nur bei belegtem Integrationsbedarf |
| IMAP4rev1 / IMAP4rev2 | Mailprogramme, Ordner, Flags, ACL, Synchronisations-/Sucherweiterungen | IMAPS anbieten; konkrete Desktop-/Mobilclients testen |
| POP3 | Legacy-Abruf vorhanden | Standardmäßig aus; Löschen beim Abruf kollidiert oft mit Webmail-Erwartungen |
| JMAP Core + Mail | JSON/HTTPS, Mailbox-/Nachrichtenoperationen, Zustände/Änderungen | Primäre Datenanbindung der nativen Webmail-Oberfläche |
| JMAP Blob Management | Upload/Download und Bloboperationen | Für Anhänge nutzen; Zugriff pro Account, kein globaler Blobproxy |
| JMAP Quotas | Ressourcenlimits über das Protokoll | Wirksame Limits anzeigen; keine eigenen fiktiven Zähler als Serverquota ausgeben |
| JMAP Sharing | Freigaben, Rechte und Benachrichtigungen | Vorhandene ACLs auf explizite Webdock-Grants abbilden |
| JMAP SSE / WebSocket / Web Push | Unterschiedliche Aktualisierungstransporte vorhanden | Für Webmail SSE-Zustandssignale plus Changes-Abgleich; Polling als Fallback. Browser-Push später |
| JMAP Sieve / ManageSieve | Regeln und Skriptverwaltung | Einfache native Regeln später; rohe Skript-Rechte nicht automatisch vergeben |

Die Protokollbasis ist in der [RFC-Liste](https://stalw.art/docs/development/rfcs/) und den [Mail-Einstellungen](https://stalw.art/docs/email/) beschrieben. JMAP-Verfügbarkeit und einzelne Erweiterungen werden aus der Session-Ressource ermittelt. [JMAP](https://stalw.art/docs/http/jmap/), [Push](https://stalw.art/docs/http/jmap/push/)

SSE oder WebSocket ist kein dauerhaftes Zustellereignisarchiv. Nach Disconnect werden Änderungen anhand des letzten Zustands nachgeladen. Bei abgelaufenem State erfolgt ein begrenzter Neuabgleich. Tokens und Zugriffsrechte müssen auch für offene Verbindungen entzogen werden; eine einmal erfolgreich geöffnete Verbindung darf Benutzerentzug nicht umgehen.

Die mitgelieferte WebUI ist laut Dokumentation Administration und Account-Self-Service. Stalwart kann weitere statische Anwendungen hosten; daraus folgt nicht, dass unsere gewünschte vollständige native Webmail-Oberfläche bereits fertig eingebaut ist. Wir behalten Studio als Frontend und benutzen die Protokolle. [WebUI](https://stalw.art/docs/management/webui/), [Applications](https://stalw.art/docs/management/applications/)

## 3. Kalender: CalDAV und JMAP

Stalwart dokumentiert persönliche und freigegebene Kalender, Serientermine, Scheduling sowie Zugriff über CalDAV und JMAP for Calendars. Der JSON-Datenansatz lässt sich für eine spätere native Webdock-Kalenderansicht nutzen; bestehende Kalenderprogramme verwenden CalDAV. Outlook-Kompatibilität ist laut Detaildokumentation gegebenenfalls pluginabhängig und wird nicht als vollständige Exchange-Kompatibilität verkauft. [Kalender](https://stalw.art/docs/collaboration/calendar/)

| Bereich | Webdock-Konsequenz |
| --- | --- |
| Discovery | `/.well-known/caldav` am veröffentlichten Host korrekt bedienen, Redirects und Auth prüfen |
| Persönlich / Team | Eigene Kalendergrants; Zugriff auf `info@firma.de` erteilt nicht automatisch Zugriff auf private Kalender |
| Termine / Serien | Zeitzonen, Sommerzeitwechsel, Ausnahmen, Ganztag und Serienänderungen testen |
| Aufgabenformate | Unterstützung von Kalender-/Taskdaten nicht mit einem fertigen Projektmanagementprodukt gleichsetzen |
| Free/busy | Nur berechtigte Verfügbarkeit anzeigen; keine tenantübergreifende Verzeichnissuche |
| Einladungen | Externe iMIP-Mails an dieselbe Mandanten-/BYOK-Route und dasselbe Budget binden |
| Updates / Absagen | Versions-/Sequenzverhalten testen; kein doppelter Einladungslauf nach Retry |
| Erinnerungen | Begrenzen, wem automatisch gemailt werden darf; kein unkontrollierter Versand an beliebige externe Ziele |
| RSVP | Webdock-Domain/Branding; GET/Linkscanner bestätigt keine Einladung, bewusster POST erst nach Nutzerauswahl |

Stalwart verwendet iTIP/iMIP für die Einladungsabwicklung, bietet Web-RSVP und konfigurierbare Vorlagen. Anpassbare Scheduling-/RSVP-Vorlagen werden als Enterprise-Funktion dokumentiert. Auto-Verarbeitung eingehender Einladungen und serverseitige E-Mail-Erinnerungen haben eigene Schutzregeln. [Scheduling](https://stalw.art/docs/collaboration/scheduling/), [Notifications](https://stalw.art/docs/collaboration/notifications/)

**Kein zweiter Kalender-Mailversender:** Kalenderaktionen können E-Mails erzeugen, ohne dass ein Benutzer unsere REST-Sende-API aufruft. Vor Freischaltung müssen solche Jobs Route, Kosten, Senderberechtigung, Limits und Fehleranzeige korrekt übernehmen. Dass MTA-Throttles gelten, beweist noch keine Integration in unser monatliches Produktbudget.

## 4. Kontakte: CardDAV und JMAP

CardDAV und JMAP for Contacts greifen auf denselben Adressbuchbestand zu. Persönliche und freigegebene Adressbücher sind vorgesehen; Stalwart kann Kontakte außerdem für Spam-/Scheduling-Entscheidungen verwenden. [Kontakte](https://stalw.art/docs/collaboration/contact/)

Empfohlener Ausbau:

1. Ein persönliches Adressbuch je Mailidentität; optionale freigegebene Adressbücher innerhalb desselben Mandanten.
2. Native Kontaktliste, Bearbeiten, vCard-Import/Export und berechtigte Empfängervervollständigung im Webmail-Composer.
3. CardDAV-Synchronisation für Geräte über `/.well-known/carddav`.
4. Keine automatische globale Kunden-/Mitarbeiterliste. Bestehende CRM-/Kundenkontakte werden nicht ungefragt zu privaten Mailkontakten.

Import/Sync muss unterschiedliche vCard-Versionen, Unicode, mehrere Mailadressen/Telefonnummern, Fotos, Konflikte und Löschungen berücksichtigen. Das Anlegen eines Kontakts darf nicht unbemerkt einen tenantübergreifenden Spam-Whitelist-Eintrag erzeugen. Native Kontaktrechte und CardDAV-Rechte müssen gleich wirken.

## 5. Dateien: WebDAV und JMAP File Storage

Stalwart bietet Datei-/Ordneroperationen über WebDAV und JMAP File Storage. Dateien teilen die Speicherverwaltung mit Maildaten. Die Dateiansicht ist ein privater Ressourcenbereich, kein Ersatz für den öffentlichen Medienstore von Payload. [File Storage](https://stalw.art/docs/collaboration/file-storage/)

Für einen späteren Webdock-Dateibereich wären Upload, Download, Ordner und Teamfreigaben nutzbar. Nicht daraus ableiten: Office-Coediting, vollständige Versionierung, öffentliche Freigabelinks oder ein Dropbox-ähnlicher Desktop-Syncclient. Diese Produktfunktionen sind gesondert nachzuweisen oder zu bauen.

WebDAV-Dateien verwenden einen konkreten Accountpfad; anders als CalDAV/CardDAV gibt es laut Dokumentation dafür keine entsprechende automatische Discovery. Authentifizierte URLs und Accountbezug aus Discovery/Provisionierung ableiten, nicht aus einer vom Benutzer eingegebenen Pfadangabe.

Standardmäßig bleibt Dateiablage deaktiviert. Sonst könnte ein Kunde sein Mailbudget mit Dateiuploads füllen oder über `FileNode`/DAV unerwartete zusätzliche Speicherleistung nutzen. Für eine Freischaltung sind separate Objektrechte, Dateigrößen-/Anzahlgrenzen und ein passender Produktplan nötig.

## 6. Freigaben, Verzeichnisse und Mandanten

Stalwart unterstützt Freigaben über JMAP Sharing und WebDAV ACL. Gruppen können eigene gemeinsame Ressourcen besitzen. Verzeichnisabfragen sind aus Datenschutzgründen eingeschränkt; ein globales Aktivieren in einem gemischten Kundenbestand wäre eine relevante Offenlegung. [Sharing](https://stalw.art/docs/collaboration/sharing/)

Webdock-Anforderungen:

- Jede Mailidentität gehört genau einem Mandanten. Ein Webdock-Benutzer darf mehrere solcher Identitäten besitzen.
- Postfach-, Kalender-, Adressbuch- und Dateifreigaben sind getrennte Rechte. „Mitglied im Kundenkonto“ erteilt nicht alle vier.
- Gruppenzugehörigkeit, Gruppe als gemeinsames Postfach und Mailingliste werden nicht gleichgesetzt.
- Principal-Discovery, Free/busy und Empfängersuche bleiben auf erlaubte Ressourcen beschränkt.
- Freigabe in einem externen Client darf keine Cross-Tenant-ACL erzeugen. Ablehnung direkt durch Stalwart testen, nicht nur durch unsere UI.
- Account-/Gruppenlöschung hat Folgen für alle Ressourcentypen. Vorher exportieren/übertragen oder ausdrücklich aufbewahren; kein implizites Löschen beim Entzug eines Postfachgrants.

Die gemeinsame Enterprise-Alternative besitzt native Mandantenisolation: [Mandanten](https://stalw.art/docs/auth/authorization/tenants/). Die gemeinschaftliche Installation hat weiterhin einen gemeinsamen Infrastruktur-Ausfallbereich; logische Isolation ist keine eigene VM pro Kunde.

## 7. Weitere Funktionsbereiche

| Bereich | Vorhandene Stalwart-Bausteine | Nutzung bzw. Grenze für Webdock |
| --- | --- | --- |
| Identität | Internes Directory, SQL, LDAP, externer OIDC; eigene OAuth-/OIDC-Rolle | Better Auth bleibt maßgeblich. Kein zweiter konkurrierender allgemeiner IdP. [Auth](https://stalw.art/docs/auth/) |
| Gerätezugänge | App-Passwörter, API-Keys, Rechte/IPs/Ablauf je Credential | In Webdock darstellen, technisch beim richtigen Principal verwalten. [App Passwords](https://stalw.art/docs/auth/authentication/app-password/) |
| SCIM | Enterprise-Provisionierung von Users/Groups, Stalwart ist Empfänger | Später für Enterprise-Lifecycle. Nicht zwei schreibende Autoritäten für dieselbe Gruppe/Person. [SCIM](https://stalw.art/docs/auth/scim/) |
| Aliase / Listen / Masken | Aliase und Mailinglisten; Masked Email als Enterprise-Funktion | Für Adressrouting prüfen; Listenteilnehmer sind nicht automatisch Send-as-Berechtigte. Masken separat optional. [Listen](https://stalw.art/docs/email/management/mailing-lists/), [Masken](https://stalw.art/docs/email/management/masked-email/) |
| Sieve | Filtern, Vacation, Redirect, Notifications, verwaltete und Benutzer-Skripte | Standardregeln wiederverwenden; Redirect/Notify/Vacation in Kosten-/Senderpolicy einbeziehen. [Sieve](https://stalw.art/docs/sieve/), [Benutzerinterpreter](https://stalw.art/docs/sieve/interpreter/untrusted/) |
| MTA | Relays, virtuelle Queues, Retry, Rate-/Queuegrenzen, Rewrite, DSN | Keine eigene SMTP-Queue nachbauen; Providerannahme bleibt von Zielzustellung getrennt. [Outbound](https://stalw.art/docs/mta/outbound/) |
| Filterintegration | Native Filter, MTA Hooks, Milter | Eigene Regeln möglichst durch vorhandene Schnittstellen anbinden. ClamAV/Rspamd nur bei belegtem Zusatzbedarf. [Filter](https://stalw.art/docs/mta/filter/) |
| Spam / Phishing | Regeln, statistische Klassifizierung, DNSBL, SPF/DKIM/DMARC, URL-/Homograph-Prüfung | Für Eingang und Forwarding; keine Marketinggarantie vollständiger Malwareerkennung. [Spamfilter](https://stalw.art/docs/spamfilter/) |
| KI | LLM-Spamklassifizierung und Sieve-Unterstützung | Standardmäßig aus; externe KI kann Mailinhalte erhalten und neue Kosten verursachen. [LLM](https://stalw.art/docs/spamfilter/llm/) |
| DNS / TLS | DNS-Provider, ACME, DKIM-Rotation, MTA-STS/DANE, Autoconfig | Bestehende Webdock-DNS-Workflows abstimmen, nur eine schreibende Autorität pro Record. [DNS](https://stalw.art/docs/server/dns/), [DKIM-Rotation](https://stalw.art/docs/domains/dkim-rotation/) |
| Discovery | Mozilla Autoconfig, Microsoft Autodiscover, PACC und DAV/JMAP-Discovery | Eigene Webdock-Hostnamen/Providertexte, tatsächliche Clientkompatibilität testen. PACC ist noch Draft. [Autoconfig](https://stalw.art/docs/server/autoconfig/) |
| Verschlüsselung | TLS, S/MIME-/OpenPGP-basierte Nachrichtenspeicherung | Nutzerschlüsselmodus ist optional und hat Folgen für Webmail/Body-Suche. [Encryption](https://stalw.art/docs/encryption/) |
| Speicher / Suche | Getrennte Data-/Blob-/Search-/In-memory-Stores, interne oder externe Backends | Kleiner Betrieb ohne unnötige Suchcluster; private Stores und echte gemessene Limits. [Storage](https://stalw.art/docs/storage/) |
| Skalierung | Mehrere Protokollknoten, verteilte Queue, koordinierte gemeinsame Stores | Später nach Lastnachweis. Zwei Prozesse mit eigenem RocksDB ergeben keinen gemeinsamen Cluster. [Clustering](https://stalw.art/docs/cluster/) |
| Betrieb | Logs, Prometheus/OTel, Webhooks; Enterprise-History, Live-Telemetrie, Alerts | Stalwart liefert Transportbeobachtung; Webdock ergänzt Produkt-/Verbrauchsledger. [Telemetry](https://stalw.art/docs/telemetry/) |
| Administration | JMAP-Managementobjekte, CLI, deklarative Upserts, Admin-WebUI | Wiederholbare Provisionierung ohne UI-Scraping; Adminoberfläche privat halten. [Deklarativer Betrieb](https://stalw.art/docs/configuration/declarative-deployments/) |
| Migration / Export | Vandelay für Mail und Collaboration, Migrationsproxy | Für spätere Mailboxmigration prüfen; Proxy nicht ohne Bedarf zusätzlich betreiben. [Import/Export](https://stalw.art/docs/migration/import-export/), [Proxy](https://stalw.art/docs/migration/proxy/) |
| HTTP-Formularversand | `/form` für lokale Empfänger | Nicht als Ersatz unserer API freischalten; lokale Formzustellung kann über Forwarding externen Versand auslösen. [Form handling](https://stalw.art/docs/http/form-submission/) |

## 8. Protokollreife statt pauschalem „alles unterstützt“

Laut Stalwarts aktueller [Spezifikationsliste](https://stalw.art/docs/development/rfcs/) sind unter anderem JMAP Core/Mail, Blob Management, Quotas, Contacts, Sharing und Sieve aufgelistete RFCs. JMAP Calendars, JMAP File Storage und mehrere neuere Discovery-/Mailauthentifizierungs-Erweiterungen werden als Drafts geführt. Weiterhin gibt es ausdrücklich erst geplante IMAP-Erweiterungen.

Für Webdock folgt daraus:

1. Laufzeitfähigkeiten aus der konkreten JMAP-Session lesen; benötigte Methoden und Account-Capabilities explizit prüfen.
2. Draft-abhängige Clientadapter samt getesteter Serverversion pinnen; Upgrade mit Vertrags-/Interoperabilitätstests.
3. CalDAV/CardDAV als etablierte Geräteprotokolle parallel nutzen. „JMAP vorhanden“ bedeutet nicht, dass Apple/Outlook/Android jede JMAP-Erweiterung nativ sprechen.
4. Bei E-Mail-Anhängen und internationalisierten Adressen gilt das schwächste Glied der gesamten Kette einschließlich Turbo.
5. DKIM2/Draft-Support ist kein pauschaler Ersatz für heute interoperable klassische DKIM-/SPF-/DMARC-Konfiguration.
6. ARC-Unterstützung nicht aus einem einzelnen RFC-Häkchen ableiten: die Detaildokumentation beschränkt sich aktuell auf Verifikation. Das Forwarding-Gate im Hauptkonzept bleibt bestehen.

## 9. Speicher, Verschlüsselung und Backups genauer betrachtet

Mail, Kalender, Kontakte und Dateien müssen beim Ressourcenmodell zusammen betrachtet werden. Native Quotas werden auf Stalwart-Account/Tenant gesetzt; externe Auth-Directory-Felder reichen dafür nicht. Webdock zeigt Gesamtverbrauch plus vorhandene messbare Teilwerte, ohne unbelegte Abrechnungsgenauigkeit zu behaupten. [Quotas](https://stalw.art/docs/auth/authorization/quotas/)

Die physische Blobablage kann über Inhalte deduplizieren. Deshalb sind ein Dateipräfix oder ein physischer Blobzähler nicht automatisch ein Mandantenexport oder ein korrekter Tarifverbrauch. Autorisierte APIs/Metadaten und logischer Verbrauch sind maßgeblich. [Blobstore](https://stalw.art/docs/storage/blob/)

Stalwarts nutzerbezogene Speicherung als OpenPGP/S/MIME ist etwas anderes als verschlüsselte Datenträger/Backups. Ohne den passenden privaten Schlüssel kann unsere Webmail nicht einfach Klartext rendern; Body-Volltextsuche wird dadurch ebenfalls eingeschränkt. Diese Option wird nicht pauschal eingeschaltet, während wir uneingeschränkte Webmail versprechen. [Encryption](https://stalw.art/docs/encryption/), [Volltextsuche](https://stalw.art/docs/storage/fts/)

Vandelay kann Accountdaten einschließlich Kalendern, Kontakten, Skripten und Dateien in ein Archiv übernehmen. Die Dokumentation weist aber darauf hin, dass umgebende Serverkonfiguration und Access Controls nicht vollständig Bestandteil dieses Accountbackups sind. Ergänzend brauchen wir versionierte Provisionierung, ACL-/Gruppen-/Tenant-Konfiguration, Secrets/DKIM und Infrastrukturbackups. Bei inkrementell aktualisierten Archiven werden auch Quelllöschungen nachvollzogen; unveränderliche historische Kopien sind für Wiederherstellung früherer Stände nötig. [Backup](https://stalw.art/docs/migration/import-export/backup/)

## 10. Ergänzungen des Umsetzungsgates

Vor dem ersten Mailrelease:

- JMAP-Management- und Datenmethoden getrennt autorisieren; öffentliches `/jmap` darf keine administrativen Credentials benutzen.
- Nicht angebotene Calendar-/Contact-/File-/Sieve-Funktionen über DAV **und** JMAP sperren, inklusive direkter Method Calls.
- Sämtliche vom Server erzeugten Nachrichtenklassen inventarisieren: Calendar iMIP, Alarme, Vacation, Sieve Notify, Forward, DSN und Betriebsalarme. Mandant, Route und Zählweise festlegen.
- Native Discovery, Standardordner/-namen und Geräteeinrichtung auf Webdock-Branding prüfen; keine versteckten „Stalwart Calendar“-Defaults im später freigegebenen Produkt.
- Wiederherstellung darf weder Grants noch geteilte Gruppenressourcen vergessen. Einen fremden Blob und ein fremdes Principal-Suchergebnis als Negativtest verwenden.

Vor dem Kalender-/Kontaktausbau:

- JMAP und DAV lesen/schreiben denselben Bestand ohne doppelten Datenspeicher.
- Geräte-, Freigabe-, Revocation-, Sommerzeit-/Serien- und Sync-Konflikttests bestehen.
- Einladungen/Erinnerungen verbrauchen das richtige Budget und nutzen Managed/BYOK auch ohne unsere REST-Sende-API.
- Clients und Server erzeugen nicht beide dieselbe Einladung oder Erinnerung.
- RSVP-Branding und Tokenablauf sind geprüft; URL-Aufruf allein verändert keine Teilnahme.
- Eine direkt per DAV gesetzte ACL kann keine Webdock-Mandantengrenze überwinden.

Die zusätzliche Prüfung bestätigt Stalwart als passende Grundlage. Sie erweitert vor allem die gemeinsamen Grenzen des Designs: Identität, Rechte, Speicher, Discovery, automatische Versandquellen und Wiederherstellung werden von Anfang an für alle angebotenen Dienste gedacht.
