# Webdock Hosting: k3s, Selfservice und Kundenkontingente

Stand: 2026-10-08. Architekturentwurf zur Prüfung; keine implementierte oder bereitgestellte Funktion.

## Auftrag

Webdock verwaltet einen vorhandenen k3s-Node, mehrere unabhängige Installationen und Cluster mit mehreren Nodes. Kunden erhalten App-/Container-Hosting als Selfservice oder Managed-Angebot. Plattformadministratoren bestimmen Kundenlimits, auch für Vercel. Oberfläche, REST-API und MCP bieten dieselben autorisierten Funktionen. Der Nutzer richtet den ersten Node selbst ein.

Planungsannahme nach „gogogogo“: sowohl eigene Container-Images als auch freigegebene App-Vorlagen. Eigene Images werden pro Kunde ausdrücklich freigeschaltet. Öffentlicher anonymer Betrieb und beliebige Kubernetes-Manifeste gehören nicht zum ersten Ausbau.

## Bestand und Anschlussstellen

- Kanonische Oberfläche: `apps/admin`, Identität und Kundenmitgliedschaften: `apps/auth`.
- `apps/auth/src/lib/plans.ts` verwaltet Paketvorlagen, Basis-/Zusatzkontingente, Angebote und Revisionen. Vorhandene Schlüssel: storageBytes, mailMessages, transferBytes, websites, editors. Diese Verträge bleiben kompatibel.
- `apps/auth/src/lib/storage-usage.ts` liefert vorhandene Speichernutzung; Hosting-Volumes dürfen nicht versehentlich doppelt in Bestandsverbrauch eingehen.
- `apps/admin/src/lib/registry.ts` verwaltet Kunden/Projekte und optionale CMS-Verbindungen. Hosting benötigt kein CMS. CMS-instanceID, Auth-bindingID und Hosting-ID bleiben getrennt.
- `registry-api.ts`, `mcp-server.ts` und `mcp-auth.ts` sind heute operator-only. Deren bestehende Registry-Rechte werden nicht für Kunden geöffnet.
- `project-deletion.ts` enthält einen dauerhaften Löschablauf für eingeschränkte CMS-/Vercel-Fälle. Dieser ist kein generischer Hosting-Lifecycle und wird nicht umgangen.
- Bestehende uncommittete Arbeit bleibt erhalten; keine Commits, PRs oder produktiven Migrationen durch diesen Entwurf.

## Architekturentscheidung

Drei Ansätze wurden betrachtet: direkter Zugriff aus Studio auf Kubernetes; ein clusterlokaler Webdock-Agent; eine zusätzliche externe Cluster-Verwaltungsplattform. Direkter Zugriff setzt erreichbare API-Endpunkte und zentral gehaltene Cluster-Zugänge voraus. Eine weitere Plattform würde zusätzlich Identität, Betrieb und Zustandsabgleich einführen.

Gewählt für die Umsetzung: eigene Studio-Oberfläche und gemeinsame Hosting-Dienste mit einem kleinen clusterlokalen Agenten. Der Agent baut ausgehende HTTPS-Verbindungen zum Webdock-Hosting-Endpunkt auf, holt begrenzte deklarative Aufträge ab und meldet beobachteten Zustand. Bestehende Workloads laufen bei Webdock-Ausfall weiter. Langlaufende Aufträge laufen nicht innerhalb eines Next.js-Requests.

Der erste Node wird als Cluster mit einem Node registriert. Weitere unabhängige Installationen besitzen eigene IDs und Agent-Identitäten. Nodeanzahl und Rollen werden beobachtet, nicht aus einem UI-Schalter abgeleitet. Bestehende Installationen werden zuerst angebunden; automatische Serverbestellung, OS-Installation und k3s-Upgrades sind eigene Folgeausbaustufen.

## Daten und Zuständigkeiten

Alle Plattform-IDs sind dezimale Snowflake-Strings. Externe IDs bleiben unveränderte Referenzen.

| Datensatz | Inhalt |
| --- | --- |
| Hosting-Cluster | Name, Provider-/Standortnachweis, Agent-ID, Isolationstyp, Besitzer bei dediziertem Betrieb, Fähigkeiten, Heartbeat, beobachtete Kapazität |
| Hosting-Projekt | Bestehendes Projekt/Kunde, Provider, Cluster bei k3s, Namespace, managed/selfservice, erlaubte Aktionen |
| Anwendung | Image-Digest oder Vorlagenversion, Ports, Probes, Ressourcen, Replikate, Secret-Referenzen, Volumes, Sollrevision |
| Limitzuweisung | Kunde, optional Projekt und Provider, Dimension, Obergrenze, Revision, Durchsetzungsart |
| Ressourcenreservierung | Kunde/Projekt, Dimension, Menge, Auftrag, reserviert/aktiv/freigabebereit |
| Hosting-Auftrag | Typ, Ziel, Akteur, Idempotenzschlüssel, Sollrevision, Status, Lease, Versuche, bereinigte Fehler |
| Beobachtung | Tatsächliche Ressourcen, Zustand, Zeitpunkt, Herkunft und Fähigkeiten; fehlende Messung ist nicht null Verbrauch |

Vertragliche Kontingente erweitern die vorhandenen Paket-/Angebotsabläufe in Auth. Technische Reservierungen und Auftragszustände liegen beim Hosting-Dienst. Die Kontingentrevision wird bei Reservierung transaktional validiert; keine alleinige Entscheidung aufgrund eines Browserwerts oder eines veralteten Auth-Caches. Existierende Datenbankzugriffsrechte werden vor Umsetzung geprüft; keine neuen unkontrollierten Cross-Schema-Schreibrechte.

## Limits und Kapazität

Erste Dimensionen: Apps, CPU-Millicores, RAM-Bytes, Volume-Bytes, flüchtiger Speicher, Replikate pro App und gleichzeitige Deployments. Build-Anzahl/-Zeit sowie Traffic und Kosten werden als eigenständige zeitbezogene Dimensionen ergänzt, sobald die dazugehörige Messung verfügbar ist. CPU-Zeit bei Vercel ist nicht mit reservierter k3s-CPU zu addieren.

Kundenlimit begrenzt die Summe über alle zugehörigen Projekte/Cluster. Zusätzliche Projekt- und Providerlimits können dieses Limit nur weiter einschränken. Fehlende neue Hosting-Berechtigung bedeutet gesperrt, null als ausdrücklich unbegrenzt bleibt eine Operatorentscheidung; Bestands-Paketsemantik wird nicht still geändert. Werte sind nichtnegative sichere Ganzzahlen mit festen Einheiten, keine impliziten Zahlenkonvertierungen.

Reservierung und Kontingentprüfung erfolgen in einer Transaktion mit Sperre pro Kunde, zusätzlich mit Cluster-Kapazitätssperre in fester Reihenfolge. Zwei parallele Deployments dürfen dasselbe Restkontingent nicht doppelt verbrauchen. Idempotenzschlüssel sind an Akteur, Ziel und Payload-Hash gebunden; abweichende Wiederholung ergibt Konflikt.

CPU/RAM werden für die erste Version konservativ anhand der konfigurierten Limits aller Replikate budgetiert, einschließlich notwendiger Rollout-Spitzen. Gemessene Nutzung wird daneben angezeigt. Systemreserve und andere Workloads werden von belegbarer Clusterkapazität abgezogen; stale/offline Cluster erlauben keine neue Zuteilung. Namespace-Quotas bilden feste Cluster-/Projektanteile des Kundenbudgets ab; ihre Summe darf das globale Budget nicht übersteigen. Ein Cluster erhält nicht jeweils das gesamte globale Kundenlimit.

Limitabsenkungen unter bestehende Belegung markieren Überbelegung und blockieren neue Zuteilungen. Keine automatische Löschung oder Unterbrechung laufender Kundenanwendungen. Skalierung und Updates rechnen Ressourcendifferenzen und temporäre Überschneidungen ein. Persistenter Speicher bleibt auch bei null Replikaten belegt.

Jede Dimension weist Durchsetzung aus: `provider-enforced`, `webdock-enforced`, `observed-only` oder `unsupported`, jeweils mit Messzeitpunkt. Unbekannte Fähigkeiten blockieren Aktionen, die harte Durchsetzung voraussetzen.

Vercel bekommt dieselbe Kundenansicht, jedoch nur tatsächlich unterstützte Limits. Webdock-interne Projekt-/Auftragslimits gelten für Webdock-Aufrufe. Externe Dashboard-/Git-Deployments können diese umgehen und werden als Drift behandelt. Keine Zusage eines harten kundenbezogenen Vercel-Kosten-/Traffic-Stopps ohne verifizierte Anbieterfunktion. Produktive Vercel-Projekte werden nicht ungefragt pausiert. Neue Bereitstellungen beachten fra1 sowie lokale/EU-Builds mit --prebuilt.

## Identität, Selfservice und Isolation

Hosting-Autorisierung löst den aktuellen Benutzer, aktive Kundenmitgliedschaft und Projektzuordnung serverseitig auf. Identität stammt aus vorhandener SSO-/OAuth-Validierung. Token-Scope allein gewährt keine Mandantenrechte. Read-only-Kundenansicht darf niemals Hosting-Aufträge starten.

Operatoren verwalten Cluster, Grenzen, Vorlagen und alle Projekte. Kunden-Owner/Admins dürfen im Selfservice-Modus nur freigegebene Aktionen auf eigenen Apps ausführen. Andere Mitglieder erhalten zunächst Leserechte. Managed-Projekte bieten Kunden Zustand/Nutzung und einen Änderungsauftrag; direkte Mutation ist dem Operator vorbehalten. Moduswechsel verleiht keine Infrastrukturrechte. Löschung bleibt in UI, API und MCP operator-only mit Vorschau, exakt bestätigtem Ziel und unverändertem Planhash.

Pro Hosting-Projekt gibt es einen verwalteten Namespace. Der Agent erstellt begrenzte, validierte Deployment-/Service-/Volume-Ressourcen; Kunden erhalten keinen Cluster-Admin-Zugang, kein freies YAML, kein hostPath oder privilegierte Pods. Restricted Pod Security, begrenzte ServiceAccounts ohne unnötigen Token-Mount, Ressourcenlimits und getestete Netzwerkisolation sind Voraussetzung für Selfservice. Netzregeln erlauben explizit erforderliches DNS, Ingress und konfigurierte App-Kommunikation und sperren andere Mandanten sowie Infrastruktur-/Metadatenziele.

Namespaces sind keine VM-Isolation. Fremde Images sind auf gemeinsamem Kernel nicht als stark isoliert zu vermarkten. Für Kunden mit entsprechendem Schutzbedarf erfolgt Zuteilung zu einem dedizierten Cluster auf eigener VM; dediziertes Cluster-Inventar wird vor Aktivierung geprüft. Bei eigener Image-Freigabe akzeptiert die Oberfläche nur die für den ausgewählten Cluster unterstützte Sicherheitsklasse.

## Agent und Auftragsausführung

Enrollment verwendet einen kurzlebigen einmaligen, clustergebundenen Token. Nach Erstbindung wird eine widerrufbare Agent-Identität ausgestellt und privat auf dem Node gespeichert. Agenten können ausschließlich eigene Aufträge abholen und eigene Beobachtungen melden. Agent-Endpunkte sind von Kunden-/Operator-APIs getrennt, rate-limitiert und replay-geschützt. Keine kubeconfig oder Provider-Secrets in UI, MCP-Antworten, Logs oder Repository.

Aufträge: queued → running → succeeded/failed/needs-reconciliation. Claim verwendet eine befristete Lease mit Fencing-Generation. Pro Ziel ist nur eine Sollrevision aktiv. Ein veralteter Worker darf eine neuere Revision nicht überschreiben. Kubernetes-Objekte tragen stabile Webdock-IDs; Retries prüfen UID, Revision und Besitz statt Ressourcen blind neu anzulegen. Bereits vorhandene fremde Namespaces/Ressourcen werden nicht übernommen.

Timeout nach möglichem externem Erfolg führt zu Reconciliation, nicht zu Freigabe der Reservierung. Freigabe erfolgt erst nach beobachtetem Rückbau; PVC-Aufbewahrung ist gesondert erfasst. Fehler enthalten bereinigte Hinweise, keine Providerantworten mit Zugangsdaten. Secret-Werte bleiben write-only, werden verschlüsselt transportiert/gespeichert und nie als normaler Auftragsinhalt ausgegeben.

Logs sind auf Projekt, App, Podbesitz, Zeitraum und Datenmenge begrenzt. Sie können von der Anwendung ausgegebene sensible Inhalte enthalten und benötigen deshalb dieselben Mandantenrechte wie Konfiguration. Kein beliebiger Kubernetes-Proxy und keine generische Shell im ersten Ausbau.

## Oberfläche, REST und MCP

Studio erhält Infrastruktur-/Clusterübersicht, Kundenkontingente, Hosting-Projektseite mit Apps, Deployments, Domains, Volumes, Logs und Aufträgen. Der Kundenbereich zeigt nur zugeordnete Projekte und freigegebene Aktionen. Neue Listen verwenden eine gemeinsame Listenkomponente; keine neuen Einzellösungen. Quelltexte Englisch, gettext Deutsch, keine Übersetzung von Kundendaten.

REST liegt unter `/api/hosting`; ein gemeinsamer Hosting-Dienst validiert und autorisiert alle Eingaben, unabhängig vom Aufrufer. Bestehende `/api/registry`-Operatorrechte bleiben unverändert. Hosting-MCP wird im bestehenden MCP-Transport angebunden, mit separater Hosting-Autorisierung und ohne Zugriff von Kunden auf Registry-Werkzeuge.

| REST-Vertrag | MCP-Werkzeug | Berechtigung |
| --- | --- | --- |
| GET /clusters, /clusters/{id} | list_hosting_clusters, get_hosting_cluster | Operator; Kunden sehen nur bereinigte eigene Hosting-Ziele |
| POST /clusters und /clusters/{id}/enrollment | register_hosting_cluster, create_cluster_enrollment | Operator; Enrollment-Geheimnis nicht über MCP ausgeben |
| GET/PUT /customers/{id}/limits | get_hosting_limits, set_hosting_limits | Lesen eigener Kunde; Schreiben Operator |
| GET /customers/{id}/usage | get_hosting_usage | Eigener Kunde/Operator |
| GET/POST /projects/{id}/apps | list_hosting_apps, create_hosting_app | Eigener Kunde mit Aktionsfreigabe/Operator |
| POST /apps/{id}/deployments | deploy_hosting_app | Aktionsfreigabe + Kontingent |
| POST /apps/{id}/scale, /restart, /rollback | scale_hosting_app, restart_hosting_app, rollback_hosting_app | Aktionsfreigabe + Kontingent |
| GET /apps/{id}/logs | get_hosting_logs | Eigener Kunde/Operator |
| GET /operations/{id} | get_hosting_operation | Autorisierter Zielzugriff |
| GET /apps/{id}/deletion, DELETE /apps/{id} | preview_hosting_app_deletion, delete_hosting_app | Operator, bestätigte Vorschau |

Domains, Secret-Schreiben, Volumes und Vorlagen erhalten dieselbe REST/MCP-Parität bei ihrer jeweiligen Ausbaustufe. Enrollment-MCP erzeugt nur eine kurzlebige Referenz auf den geschützten Operator-Browserablauf. Mutationen geben Auftrag-ID und Status mit HTTP 202 zurück; Kontingent-/Revisionskonflikte HTTP 409. Alle Listen sind paginiert. MCP readOnly/destructive/idempotent-Metadaten entsprechen der wirklichen Semantik.

## Abgrenzbare Lieferabschnitte

1. **Hosting-Fundament:** additive Migrationen, Kundenlimits/Reservierungen, Autorisierung, Auftragsjournal, Clusterinventar/Enrollment/Heartbeat, Operator-/Kundenansichten, REST/MCP-Parität. Ohne Agent-Verbindung bleibt Status ausdrücklich unverbunden.
2. **Erste echte Anwendung:** Agent, Namespace-Sicherheit/Quota, eigene Images und versionierte Vorlage, Deploy/Scale/Restart/Rollback, Logs, Domain-/TLS-Anbindung nach Eigentumsprüfung, Secrets, persistentes Volume mit verifizierter StorageClass. Durchgängiger lokaler Test plus gezielter Test auf dem neuen Node.
3. **Providerübergreifende Kontingente:** bestehende Vercel-Verknüpfungen zuordnen, aktuelle Providerfähigkeiten prüfen, belegbare Nutzung und Grenzen integrieren, externe Drift sichtbar machen. Keine fiktive harte Sperre und keine automatische Migration bestehender Projekte.
4. **Betriebsausbau:** Backup mit getesteter Wiederherstellung, Node-Wartung/Updates, zusätzliche Cluster, dedizierte Kundeninstallationen, EU-Build-/Registry-Pipeline. Provider-Serverbestellung wird erst mit explizit gewähltem Anbieter und Zugang konkretisiert.

Diese Abschnitte sind jeweils eigenständig prüfbar, aber erst Abschnitt 2 liefert Container-Selfservice. Abschnitt 1 allein darf nicht als fertiges Hosting verkauft werden. Automatische Abrechnung, beliebige Datenbank-Templates und HA-Speicher werden nicht durch ein funktionierendes Deployment impliziert.

## Standort und erster Node

Alles muss in der EU, bevorzugt Deutschland, laufen: Steuerung, Agent, Workloads, Registry, Builds, Daten, Backups und betroffene externe Dienste. Der derzeitige Vercel-Betrieb von Studio/Auth ist keine vollständige EU-only-Garantie. Hosting-Geheimnisse und Kundendaten dürfen erst über einen verifizierten EU-Betriebsweg fließen; eine nötige Migration der Steuerung ist eine reale Bereitstellungsvoraussetzung, keine erledigte Annahme.

Für die Live-Anbindung werden Anbieter/Standortnachweis, k3s-Version, Architektur, nutzbare Kapazität, StorageClass, Netzwerk-/DNS-/Ingress-Konfiguration und ein privater administrativer Installationsweg benötigt. Keine Zugangsdaten im Chat erfragen. Bis der Node fertig ist, Implementierung und Tests ausschließlich lokal mit wegwerfbaren Daten/Clustern; keinen bestehenden Cluster als Testziel auswählen.

## Nachweise vor Freigabe

- Kundentrennung: fremde IDs, Logs, Aufträge, Secrets und gefälschte Eigentumsfelder über UI/REST/MCP ablehnen; Kundenansicht und read-only OAuth dürfen nicht schreiben.
- Kontingente: parallele Reservierungen, exakte Grenzwerte, Overflow, fehlende Pakete, Limitabsenkungen, mehrere Cluster, Rollout-Spitzen, Offline-/veraltete Beobachtung.
- Wiederaufnahme: Agent-Neustart, verlorene Antwort, doppelte Auslieferung, alte Lease, widerrufene Identität, vorhandene fremde Ressourcen, fehlgeschlagener Teilrückbau.
- Kubernetes: Netzwerkisolation tatsächlich testen; privilegierte Pods, Metadatenzugriff, unerlaubte Mounts und Ressourcenüberschreitung ablehnen; Storage-/TLS-Fähigkeiten nachweisen.
- Vercel: unsupported und observed-only sichtbar, kein Scheinlimit; Bestandsfunktionen und fra1-Regeln erhalten.
- Browser: T3 preview_status/preview_open, echte Operator- und Kundensitzung, vollständiger Ablauf vom Limit bis zu beobachteter laufender App; kein Erfolg allein aus HTTP 200.
- Nur lokale wegwerfbare Testdatenbanken; Migrationen explizit, keine Produktionsresets. Abschluss benennt implementiert, lokal geprüft, live geprüft und noch gesperrt getrennt.

## Referenzen

- Kubernetes ResourceQuota: https://kubernetes.io/docs/concepts/policy/resource-quotas/
- Kubernetes Multi-tenancy: https://kubernetes.io/docs/concepts/security/multi-tenancy/
- K3s Hardening Guide: https://docs.k3s.io/security/hardening-guide

Die Dokumentation wurde für grundlegende Quota-/Isolationsanforderungen konsultiert. Konkrete API-Versionen und Fähigkeiten werden gegen die tatsächlich installierte k3s-Version geprüft.
