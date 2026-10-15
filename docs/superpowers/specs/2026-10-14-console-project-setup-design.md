# Projekte und verbundenes Anwendungs-Setup in der Webdock Console

Status: Bedienkonzept und technische Spezifikation vom Nutzer am 2026-10-14 bestätigt. Implementierungsplanung freigegeben; noch keine Produktimplementierung.

## Ziel und bestätigter Auftrag

Du legst in der Webdock Console ein Projekt an, verbindest ein Git-Repository oder wählst ein Container-Image, konfigurierst die Anwendung und ergänzt benötigte Dienste wie PostgreSQL und Mail. Webdock richtet die ausgewählten Verbindungen tatsächlich ein und zeigt ihren Zustand im Projekt. Du musst dafür keine Zugangsdaten zwischen Produktseiten kopieren.

Das bestätigte Bedienkonzept ist ein geführtes Projekt-Setup mit anschließender Ressourcenverwaltung. Ein Projekt enthält mehrere Anwendungen; eine Anwendung hat ihre eigene Quelle, Konfiguration, Releases und Dienstverbindungen. Repository-Konfiguration mit `webdock.yaml` ist ein späterer Ausbau.

Diese Spezifikation betrifft Webdocks vorhandene Console, API und verwaltete Kubernetes-Infrastruktur. Sie führt keinen neuen Hostinganbieter ein.

## Geprüfter Bestand und notwendige Erweiterungen

| Bereich | Bestand | Änderung |
| --- | --- | --- |
| Projektanlage | Operator-Formular unter `/projects/new`; Hosting wird getrennt zugewiesen | Nach Anlage direkt zur gemeinsamen Einrichtung; vorhandene Rollen bleiben maßgeblich |
| Anwendungen | `apps.create`, Ressourcen, Umgebungsvariablen, Operationen, Healthchecks | Geführte Erstellung mit Vorschau; Git-Ziele können vor der ersten Veröffentlichung ohne laufenden Platzhalter vorbereitet werden |
| Git | GitHub-Verbindungen, Repository-Berechtigungen, Build-Queue, Veröffentlichung und Rollback | Quelle pro Zielanwendung; derzeit erzwingt `git_source.project_id` genau eine Quelle pro Projekt |
| PostgreSQL | Katalog, Angebote, ausdrückliche Preisannahme, asynchrone Bereitstellung, Credentials | Sichere Dienstverbindung zur Anwendung, inklusive TLS und Netzwerkerreichbarkeit |
| Mail | Kundengebundene native Mailfunktionen | Anwendungsspezifischer eingeschränkter Versandzugang und persistente Zuordnung |
| Container-Images | Vorhandenes Formular bezeichnet Images ausdrücklich als bereits auf dem Node vorhanden | Nur tatsächlich unterstützte Bezugswege anbieten; Import muss Digest, Authentifizierung und Runtime-Verfügbarkeit prüfen |
| Projektübersicht | Anwendungen, Git und Datenbanken auf getrennten Seiten | Gemeinsame Übersicht mit echten Quellen, Verbindungen und Betriebszuständen |

Maßgebliche Implementierungen: `apps/admin/src/lib/actions.ts`, `apps/admin/src/components/hosting/app-spec.tsx`, `apps/api/src/modules/hosting/apps.ts`, `apps/api/src/modules/hosting/git-deployments.ts`, `apps/api/src/modules/hosting/git-deployment-schema.ts`, `apps/api/src/modules/hosting/database-credentials.ts` und `apps/api/src/modules/mail/product/`.

## Informationsarchitektur

Der sichtbare Kontext ist **Kunde → Projekt → Anwendung**. Die Projektnavigation enthält Übersicht, Anwendungen, Dienste, Deployments und Einstellungen. Bestehende Detailseiten bleiben erreichbar; vorhandene Links werden bei einer Verschiebung weitergeleitet.

Die Übersicht zeigt:

- Anwendungen mit Name, Quelle, Branch beziehungsweise Image-Digest, beobachtetem Zustand und nächster sinnvoller Aktion.
- Dienste mit Zustand und den tatsächlich verbundenen Anwendungen.
- Offene Einrichtungsschritte mit konkreter Ursache und Fortsetzungsmöglichkeit.
- **Anwendung hinzufügen** und **Dienst hinzufügen**, soweit die aktuelle Rolle diese Aktionen erlaubt.

Anwendungsdetails enthalten Quelle, Deployments, Logs, Ressourcen, Dienstverbindungen und Umgebungsvariablen. Projektdaten bleiben von Hosting-Einstellungen und dem optionalen CMS unterscheidbar.

Ein Umgebungsumschalter erscheint erst, wenn getrennte Umgebungen einschließlich Ressourcen, Secrets und Berechtigungen implementiert sind. Die erste Lieferung arbeitet mit dem vorhandenen Produktionskontext; sie täuscht keine Staging-Isolation vor.

## Geführter Ablauf

### 1. Projekt und Hosting

Neue Projekte benötigen Name und Kunde. Website-URL, Repository-Notiz und weitere Metadaten sind optional. Nach Anlage öffnet sich die Einrichtung.

Bei einem bestehenden Projekt wird dessen Hosting-Zuweisung wiederverwendet. Fehlt sie, zeigt das Setup erlaubte, tatsächlich verfügbare Hostingziele. Eine Zuweisung erfolgt nur mit bestehenden Operator-Berechtigungen; andere Nutzer erhalten einen verständlichen Hinweis. Die neue Oberfläche erweitert keine Rollen stillschweigend.

### 2. Quelle

**Git-Repository:** GitHub verbinden beziehungsweise eine bestehende Verbindung auswählen, Repository auswählen, Branch und Unterordner festlegen. Die OAuth-Rückkehr führt zurück zur Einrichtung. Der Repository-Standardbranch ist der Ausgangswert. Mehrere Anwendungen können dasselbe Repository mit unterschiedlichen Unterordnern verwenden.

**Container-Image:** Image angeben und gegen die Fähigkeiten des Hostingziels prüfen. Ein Tag wird vor der Bestätigung zu einem unveränderlichen Digest aufgelöst. Private Registry-Zugänge werden verschlüsselt und getrennt von der Anwendungsumgebung gespeichert. Ein nicht unterstützter Import bleibt ein sichtbarer Blocker.

**Vorlage:** Nur tatsächlich verfügbare Vorlagen anbieten, beginnend mit der bestehenden HTTP-Healthcheck-Vorlage. Eine Vorlage benennt ihre Grenzen; sie ersetzt keine fehlende Git-Anwendung.

Repository-Analyse liest begrenzt bekannte Konfigurationsdateien des ausgewählten Commits. Sie führt keine Installations- oder Buildskripte aus. Dockerfile, Build-Kontext, Port und Dienstbedarf werden als überprüfbare Vorschläge dargestellt. Ohne eindeutige Erkennung kann der Nutzer die Werte selbst setzen. Ein erkanntes Datenbankpaket löst keine Bestellung aus.

### 3. Anwendung

Sichtbare Kernfelder: Name, Ressourcenprofil und HTTP-Port. Erweiterte Einstellungen umfassen Dockerfile-/Build-Kontext, Argumente, Healthcheck, Instanzzahl, temporären Speicher, persistentes Volume und eigene Umgebungsvariablen. Ressourcenprofile müssen auf die vorhandenen Kontingente und tatsächlich verfügbaren Tarife abgebildet werden.

Die bestehenden Runtime-Vorgaben bleiben erhalten: kein Root, eingeschränkte Ports, schreibgeschütztes Root-Dateisystem, begrenzte Ressourcen. Persistenter Speicher verwendet zunächst den unterstützten `/data`-Pfad. Ein Hintergrundworker ohne HTTP-Port wird erst angeboten, wenn Verträge, Healthchecks und Agent diese Betriebsart unterstützen.

Öffentliche Erreichbarkeit und Domains werden nur angeboten, wenn das Ziel Ingress und TLS tatsächlich bereitstellen kann. Ein intern laufender Container erhält keinen angeblich öffentlichen Link.

### 4. Dienste

**PostgreSQL:** Neue Datenbank bestellen oder eine berechtigte, kompatible Datenbank desselben Projekts verbinden. Die Auswahl zeigt Preis, Speicher, Verfügbarkeit und die tatsächlich vorhandene Backup-Leistung. Eine bestehende Datenbank wird weder neu bestellt noch kopiert.

Die Verbindung stellt `DATABASE_URL` mit der Anwendungsrolle bereit. Migrationszugänge werden nicht automatisch in die Runtime injiziert. URL-Encoding, gepoolter beziehungsweise direkter Port und Zertifikatsprüfung müssen zum tatsächlichen Backend passen. Die bestehende Vorgabe `sslmode=verify-full` bleibt erhalten; die notwendige CA wird als verwaltetes Secret bereitgestellt. Die Runtime erhält nur die erforderliche Netzwerkfreigabe.

**Mailversand:** Eine berechtigte native Mailverbindung und verifizierte Absenderdomain des Kunden auswählen beziehungsweise die vorhandene Einrichtung fortsetzen. Webdock erzeugt einen anwendungsbezogenen Versand-Key mit möglichst enger Domain-Berechtigung und stellt API-Endpunkt und Key als Runtime-Secrets bereit. Fehlt Domain-Verifizierung oder Versandbereitschaft, bleibt die Verbindung ausstehend. Turbo-Zugangsdaten erreichen die Anwendung nicht.

**Postfächer und Weiterleitungen:** Separat und ausdrücklich aktivierbar; verwenden dieselbe kundeneigene eingehende Mailinstanz. Diese Auswahl ist keine Voraussetzung für Anwendungs-Mailversand.

**Speicher:** Persistentes Volume mit unterstützter Größe und Mount-Pfad. Das Setup zeigt die bestehenden Einschränkungen für Instanzzahl, Größenänderung und Datenaufbewahrung.

Ein Dienst wird erst als verbunden angezeigt, wenn Berechtigung, Secret-Bereitstellung und notwendige Netzwerkkonfiguration erfolgreich sind. Die Anzeige bedeutet nicht, dass die Anwendung bereits eine fachliche Datenbankabfrage oder einen Mailversand ausgeführt hat.

### 5. Prüfen und bereitstellen

Die Vorschau enthält Quelle und Commit beziehungsweise Image-Digest, Anwendungskonfiguration, Dienste, Kosten und offene Voraussetzungen. Bestehende Gebühren werden von neuen Bestellungen unterschieden. Unbekannte nutzungsabhängige Kosten werden nicht als null dargestellt.

Kostenpflichtige Datenbankangebote benötigen weiterhin eine ausdrückliche Annahme der konkreten Konditionen. Die Bestätigung bindet die geprüfte Setup-Revision und Angebotsrevision. Bei Änderungen an Preis, Quelle, Berechtigungen oder Ressourcen muss die Vorschau aktualisiert werden.

Nach Bestätigung zeigt eine gemeinsame Fortschrittsansicht die realen Schritte und darunter die vorhandenen Build-/Operationsdetails. **Bereit** setzt die beobachtete Runtime-Bereitschaft voraus. Ein erfolgreicher HTTP-Aufruf zum Erstellen einer Operation reicht nicht aus.

## Backend und persistenter Zustand

### Einrichtungsvorgang

Ein neuer Einrichtungsvorgang gehört eindeutig zu Kunde und Projekt. Er speichert Revision, auslösenden Akteur, validierte Nicht-Secret-Konfiguration, Referenzen auf verschlüsselte Secrets, Angebotsreferenzen und erzeugte Ressourcen-IDs. Die Console hält den maßgeblichen Zustand nicht nur im Browser.

Operationen sind Entwurf speichern, Vorschau erstellen, geprüfte Revision bestätigen, Status lesen und unterbrochene Schritte fortsetzen. Sie verwenden die bestehenden API-/Hosting-Berechtigungen und werden auch für REST/MCP über dieselbe Servicelogik zugänglich gemacht.

Die Zustände sind `draft`, `awaiting-confirmation`, `running`, `blocked`, `failed` und `ready`. Jeder Teilschritt speichert seinen Zustand und seine externe beziehungsweise interne Operations-ID. Eine dauerhafte Queue führt längere Arbeit außerhalb von Next.js-Requests aus; das vorhandene PostgreSQL-/Worker-Muster wird wiederverwendet.

Die Ausführung validiert Berechtigungen und Kontingente erneut. Wiederholte Bestätigung derselben Revision erzeugt weder eine zweite Anwendung noch eine zweite Datenbank oder einen zweiten Mail-Key. Jeder Schritt besitzt einen stabilen Idempotenzschlüssel. Bei unklarem Ausgang wird zuerst der vorhandene Vorgang abgeglichen.

Für Git wird eine Anwendungsidentität ohne laufenden Platzhalter angelegt. Erst ein erfolgreich gebautes, freigegebenes Artefakt wird veröffentlicht. Dienste und Runtime-Secrets können zuvor vorbereitet werden; ihre Werte werden nicht automatisch als Build-Secrets verfügbar.

### Git pro Anwendung

Die Eindeutigkeit der Git-Quelle wird von `project_id` auf Projekt plus Ziel umgestellt. Vorhandene Quellen behalten ID, Ziel, Revision, Buildhistorie und Releasehistorie. Quellenkonfiguration, Buildanforderung und Quellabfrage erhalten einen expliziten Ziel-/Quellbezug.

Bestehende projektbezogene Aufrufe bleiben kompatibel, wenn genau eine Quelle existiert. Bei mehreren Quellen verlangen sie eine Auswahl; sie verwenden niemals stillschweigend die erste Quelle. Projektweite Build- und Releaselisten bleiben aggregierbar und kennzeichnen die jeweilige Anwendung.

Webhook-Verarbeitung, GitHub-Actions-Import, Worker-Claims, veraltete Builds, Veröffentlichung und Rollback müssen denselben Quellbezug verwenden. Ein Push kann mehrere passende Quellen auslösen. Die Veröffentlichung einer Anwendung überschreibt weder die Quelle noch den gewünschten Release einer anderen Anwendung.

### Dienstverbindungen

Eine persistente Verbindung enthält Projekt, Anwendung, Diensttyp, Dienst-ID, konfigurierten Umgebungsvariablennamen, Secret-Revision und beobachteten Verbindungszustand. Datenbankverbindungen sind zunächst projektgebunden; Mailverbindungen referenzieren einen berechtigten kundengebundenen Dienst.

Verwaltete Variablennamen dürfen vorhandene manuelle Variablen nicht kommentarlos überschreiben. Die Vorschau meldet Kollisionen. Rotation eines Dienstzugangs aktualisiert die verwaltete Secret-Revision und plant die notwendige Anwendungsaktualisierung; die Anzeige bleibt bis zur Beobachtung ausstehend.

Das Trennen einer Verbindung entfernt den anwendungsbezogenen Zugang und dessen Netzwerkfreigabe, soweit sie nicht anderweitig gebraucht wird. Es löscht weder den zugrunde liegenden Dienst noch seine Daten. Andere Anwendungen bleiben verbunden.

## Sicherheit und Fehlerverhalten

Alle Lese- und Schreiboperationen prüfen die bestehende Kunden-/Projektzugehörigkeit. Browserwerte, Repository-IDs, Dienst-IDs und Rücksprungpfade sind keine Berechtigungsnachweise. Read-only-Kundenvorschauen dürfen keine Einrichtung starten oder fortsetzen.

Private Git- und Registry-Zugänge bleiben außerhalb der Runtime. Runtime-Secrets gelangen weder in Git noch in Statusantworten oder Logs. Build-Secrets bleiben separat und müssen ausdrücklich ausgewählt werden.

Fehlschläge werden pro Schritt dargestellt. Eine bereits bereitgestellte Datenbank bleibt erhalten, wenn anschließend der Build scheitert. Fortsetzen verwendet die gespeicherten Ressourcen-IDs. Ein abgelaufenes Angebot wird vor Bestellung erneuert und bestätigt. Ein widerrufener GitHub-Zugriff blockiert neue Builds, ohne die laufende Anwendung zu löschen.

Neue Einrichtung, Neustart, Trennen, Deaktivieren und Löschen bleiben verschiedene Aktionen. Bestehende Operator-Grenzen für destruktive Vorgänge werden beibehalten. Die Oberfläche benennt verbleibende Ressourcen und Gebühren bei einem abgebrochenen Setup.

## Verbindliche Mail-Regeln

`docs/architecture/mail-deployment-decision.md` bleibt maßgeblich:

- Reiner Versand: Webdock API → Turbo-Relay-API; keine Stalwart-Instanz und kein Mailvolume.
- Eingehende Mail einschließlich Weiterleitungen: explizite Aktivierung und eine isolierte Stalwart-CE-Instanz pro Kunde auf dem bestehenden Contabo-/Kubernetes-Cluster.
- Mehrere Projekte und Domains des Kunden erzeugen keine zusätzlichen Instanzen.
- Deaktivierung behält Daten; Löschen ist ein separater Vorgang.
- Ein ausstehender oder ausgefallener eingehender Dienst fällt nicht stillschweigend auf den Versandpfad ohne Stalwart zurück.
- Vorhandene Spitzli-Instanz, Verschlüsselungsschlüssel, Storage und Replica-Ownership werden erhalten.

## Lieferung und Abgrenzung

Die erste Lieferung ist erst vollständig, wenn ein berechtigter Nutzer eine Anwendung aus Git beziehungsweise einem unterstützten Image mit PostgreSQL und Mailversand einrichten, den Fortschritt verfolgen und ihre echten Verbindungen in der Projektübersicht verwalten kann.

Für die Umsetzung werden drei zusammenhängende Arbeitspakete geplant: Git-Quellen und Dienstverbindungen, dauerhafter Einrichtungsvorgang, Console und Ende-zu-Ende-Prüfung. Die UI wird nicht als abgeschlossene Lieferung mit lediglich weiterführenden Links auf getrennte Formulare gewertet.

Spätere eigenständige Ausbaustufen sind `webdock.yaml`, automatische Framework-Builds ohne Dockerfile, PR-Previews, isolierte Staging-Umgebungen, zusätzliche Datenbanktypen und HTTP-lose Worker. Bestehende Vercel-Deployments bleiben funktionsfähig; ihr bisheriger Ablauf wird nicht durch einen unvollständigen neuen Adapter ersetzt.

## Abnahme und Verifikation

1. Neues Projekt und bestehendes Projekt führen in denselben Setup-Ablauf; Rollen- und Hostinggrenzen bleiben erhalten.
2. Zwei Anwendungen desselben Projekts verwenden unterschiedliche Quellen oder Unterordner ohne gegenseitiges Überschreiben. Bestehende Quellen und Releases überstehen die Migration.
3. Fremde Kunden-, Projekt-, Repository- und Dienst-IDs werden abgelehnt, ebenso Mutationen aus einer Read-only-Vorschau.
4. Neue Datenbankbestellungen benötigen die konkrete Preisannahme. Doppelklick, Reload und Job-Neustart erzeugen keine doppelten Ressourcen oder Bestellungen.
5. Eine Anwendung kann mit der automatisch verbundenen Datenbank über die Anwendungsrolle und geprüfte TLS-Verbindung eine Testabfrage ausführen. Andere Kundennetze bleiben ausgeschlossen.
6. Ein anwendungsbezogener Mail-Key kann nur die zugelassenen Versandaktionen ausführen. Versand-Setup allein erzeugt keine Stalwart-Instanz. Reale Testmails gehen ausschließlich an ausdrücklich freigegebene Testempfänger.
7. Scheitert Build, Secret-Aktualisierung oder Healthcheck, zeigt die Console den betroffenen Schritt; Fortsetzen verwendet bestehende Ressourcen und behält Daten.
8. Trennen einer Anwendung vom Dienst beeinträchtigt keine andere Verbindung; Rotation aktualisiert den beobachteten Zustand korrekt.
9. Desktop und mobile Console werden in Deutsch und Englisch geprüft: Vor-/Zurücknavigation, OAuth-Rückkehr, Fehler, Kostenannahme, Fortschritt, Tastaturbedienung und bestehende Detailseiten.
10. Relevante API-/Contracttests, die Admin-Testsuite, Typechecks, Übersetzungsextraktion/-kompilierung und Browserprüfung werden ausgeführt. Lokale Fixtures bleiben von Produktionsressourcen getrennt. Live-Abnahmevoraussetzungen und nicht geprüfte Integrationen werden ausdrücklich dokumentiert.
