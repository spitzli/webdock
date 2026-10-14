# Elysia-FSR 0.1.0: Quellcodeprüfung und Reproduktion

Stand: 13.10.2026. Geprüft wurde `deadlinecode/elysia-fsr` am Commit `43e33e0c27e66d0cc70b172c3b99f3f02c3d0db0`. Einsatzannahme: Webdocks selbst gehostete API mit privaten Mandantendaten, Operatorrechten und Polar-Webhooks.

**Ergebnis:** Das kleine Paket ist als Dateirouter brauchbar. Für Webdocks Produktionsbetrieb würde ich den Start bei Ladefehlern abbrechen lassen und Sicherheitsgrenzen außerhalb der automatisch geladenen Ghost-Dateien festlegen. Es gibt einen konkret reproduzierten Fall, in dem ein defekter Guard eine Route ungeschützt lässt.

## Prüfumgebung und tatsächlich ausgeführte Checks

- Upstream-Quellarchiv in einem separaten temporären Verzeichnis, keine Änderung am Produktcode von Webdock oder am veröffentlichten FSR-Paket.
- Dependencies zunächst aus Upstream-Lockfile mit `bun install --frozen-lockfile --ignore-scripts` installiert: Elysia `1.4.28`, Bun lokal `1.3.14`.
- Upstream-Tests: **11 bestanden, 0 fehlgeschlagen**, anschließender Typecheck erfolgreich.
- Zweiter Lauf passend zum API-Plan: Bun **1.4.3**, Elysia **1.4.30**, FSR unverändert. Bun-Releasearchiv anhand des von GitHub gelieferten SHA-256 geprüft; kein globales Runtimeupdate.
- Unter Bun 1.4.3 direkt `bun test` und `bun node_modules/typescript/bin/tsc -p tsconfig.types.json --noEmit`: ebenfalls **11 bestanden, 0 fehlgeschlagen**, Typecheck erfolgreich.
- Zusätzliche lokale Probe mit HTTP-Requests gegen `app.handle()` und kontrollierten Route-Trees ausgeführt. Kein öffentlicher Testserver und keine echten Kundendaten.
- Die Upstream-Suite gibt eine `exactMirror`-Warnung beim Wildcard-Schema aus; Tests laufen dennoch durch. Ursache nicht als FSR-Fehler nachgewiesen.

Die grüne Upstream-Suite deckt die folgenden Fehlerfälle nicht ab. Ihr Runtimehelper prüft Responseinhalte, nicht generell HTTP-Statuscodes; der Typecheck enthält nur einen konkreten Eden-Responsevergleich.

## 1. Vor Produktion beheben: Guard-Importfehler lässt private Route offen

**Quelle:** [`src/scan.ts:25–32`](https://github.com/deadlinecode/elysia-fsr/blob/43e33e0c27e66d0cc70b172c3b99f3f02c3d0db0/src/scan.ts#L25), [`src/tree.ts:39–43`](https://github.com/deadlinecode/elysia-fsr/blob/43e33e0c27e66d0cc70b172c3b99f3f02c3d0db0/src/tree.ts#L39).

Reproduktion: `(secure).ts` wirft beim Import einen Fehler, `(secure)/secret.ts` enthält einen normalen GET-Handler. FSR protokolliert den Fehler und lädt die Kindroute trotzdem. `GET /secret` ohne Anmeldung liefert **200 mit privaten Testdaten**. Mit korrekt geladenem Guard liefert dieselbe Route **401**.

Minimale Verbesserung im Paket: Option `strict`/`onError: "throw"`; bei Importfehler oder ungültigem erwartetem Routenexport vor Baumkomposition abbrechen. Für Produktion strict verpflichtend. Bewusst ausgeschlossene Hilfsdateien vor dem Import filtern, nicht Fehler durch pauschales Skippen normalisieren.

Webdock-Absicherung: Autorisierung statisch in `app.ts` bzw. explizit importierten Security-Plugins installieren und dann den zugehörigen FSR-Teilbaum darunter einhängen. Ein defektes Guardmodul muss entweder den Start verhindern oder die statische Schutzgrenze bleibt wirksam. In einer Gegenprobe blockierte ein expliziter Parent-Guard den gleichen defekten FSR-Baum korrekt mit **401**.

Ohne Änderung kann ein defektes Deployment aus einem Ladefehler einen Zugriffsschutzfehler machen. Das ist kein Nachweis einer bereits erreichbaren Schwachstelle im aktuellen Webdock; FSR ist dort noch nicht eingebaut.

## 2. Vor Produktion beheben: identische Routen überschreiben sich still

**Quelle:** [`src/tree.ts`](https://github.com/deadlinecode/elysia-fsr/blob/43e33e0c27e66d0cc70b172c3b99f3f02c3d0db0/src/tree.ts), insbesondere Speicherung mehrerer Apps je Knoten und `mergeApps()`.

Reproduktion: `users.ts` und `users/index.ts` definieren beide `GET ""`. Beide sind nach der dokumentierten Dateikonvention gültig und ergeben `GET /users`. Anwendung startet ohne Konfliktmeldung; im Versuch antwortet nur der Indexhandler. Die Route-Liste enthält anschließend nur noch einen Gewinner.

Verbesserung: Vor dem Merge kollidierende **HTTP-Methode + endgültigen normalisierten Pfad** einschließlich Ghost-Flattening erkennen und beide Ursprungsdateien in der Fehlermeldung nennen. GET und POST auf demselben Pfad bleiben erlaubt. Nicht erst die bereits deduplizierte fertige `app.routes`-Liste kontrollieren.

Zusatzprobe: `[id].ts` und `[slug].ts` an derselben Stelle führen zu einem Memoirist-Konflikt beim Kompilieren/ersten `app.handle()`. Solche äquivalenten Parameterpfade ebenfalls vor dem Listen erkennen. `app.compile()`/verifizierter Startup-Smoke gehört vor Readiness.

## 3. Komposition verbessern: Ghost-Guard hängt vom ersten Modul ab

**Quelle:** [`src/tree.ts:75–79`](https://github.com/deadlinecode/elysia-fsr/blob/43e33e0c27e66d0cc70b172c3b99f3f02c3d0db0/src/tree.ts#L75).

`composeNode()` verwendet bei Ghost-Gruppen das erste gefundene Elysia-Modul als Basis. Bei zwei kontrollierten ScanResult-Reihenfolgen mit `(secure).ts`, `(secure)/index.ts` und einer Kindroute ergeben sich unterschiedliche Berechtigungen:

| Reihenfolge in der Komposition | Anonymer Index | Anonyme Kindroute |
|---|---:|---:|
| Guard zuerst | 401 | 401 |
| Index zuerst | 200 | 200 |

**Evidenzgrenze:** Die umgekehrte Reihenfolge wurde gezielt an der tatsächlichen Tree-Komposition injiziert. Der natürliche Bun-Scan lieferte in den getesteten Dateisystemfällen Guard zuerst, auch wenn die Indexdatei zuerst angelegt wurde. Es ist kein beobachteter zufälliger Bypass des natürlichen Scans. Der Befund ist die nachgewiesene Reihenfolgeabhängigkeit ohne expliziten Prioritätsvertrag.

Verbesserung: Gruppen-Controller anhand seiner Rolle erkennen und vor Gruppenindex/Kindern komponieren, unabhängig von Iterationsreihenfolge. Stabile Sortierung für Diagnose/Typausgabe ergänzen; nur alphabetische Sortierung ersetzt keinen expliziten Controllervertrag. Webdock-Auth weiterhin statisch außen installieren.

Das folgt auch Elysias dokumentierter Kapselung von Hooks: Plugin-Scopes sind Teil der Semantik, nicht bloße Dateiorganisation. [Elysia Scopes](https://elysiajs.com/essential/plugin#scope)

## 4. Für Webdock relevant: `.well-known` wird nicht entdeckt

**Quelle:** [`src/scan.ts:21–23`](https://github.com/deadlinecode/elysia-fsr/blob/43e33e0c27e66d0cc70b172c3b99f3f02c3d0db0/src/scan.ts#L21); [Bun Glob](https://bun.sh/docs/runtime/glob).

Reproduktion: `routes/.well-known/openid-configuration.ts` vorhanden, neben einer normalen Indexroute. Die normale Route antwortet 200, Discovery antwortet **404** und fehlt in der registrierten Liste. Der Scan verwendet keine Option für versteckte Verzeichnisse.

Verbesserung: Eine bewusst gesetzte Dotfile-Option und klare Ausschlüsse oder ausdrückliche Mounts solcher Protokollrouten. Für Webdock empfehle ich OIDC-Discovery und Better Auth **explizit** zu registrieren. Nicht global alle versteckten Dateien einschließlich `.git` und temporärer Dateien scannen.

## 5. Kleinere Verbesserungen mit konkretem Anlass

### Fehlerhafte Routenverzeichnisse

FSR legt ein fehlendes Verzeichnis automatisch an. Mit `types:false` läuft eine so entstandene leere Anwendung und antwortet 404. Für Produktion: `createMissingDir:false`/strict-Prüfung und Pflichtmanifest. Entwicklungsfreundliche Ordneranlage darf optional bleiben.

### Routensyntax validieren

[`src/path.ts`](https://github.com/deadlinecode/elysia-fsr/blob/43e33e0c27e66d0cc70b172c3b99f3f02c3d0db0/src/path.ts) erkennt Parametermuster auch mitten im Segment. In der Probe wurde `v[id].ts` zu `/:id`; sowohl `/v123` als auch `/123` antworteten 200. `[...rest].ts` wurde zu `/:...rest`, `/a/b` lieferte 404.

Das README verspricht nur vollständige `[id]`-Segmente und den unbenannten Catch-all `[...]`. Deshalb ist die kleine Verbesserung **nicht**, sofort neue Next.js-Routensyntax zu entwickeln: Nicht unterstützte Klammerformen mit klarer Fehlermeldung ablehnen. Regexe an den gesamten Segmentstring binden und Parameternamen validieren.

### Typgenerierung und Build trennen

[`src/emit-types.ts`](https://github.com/deadlinecode/elysia-fsr/blob/43e33e0c27e66d0cc70b172c3b99f3f02c3d0db0/src/emit-types.ts) importiert Prettier im Runtime-Abhängigkeitspfad und schreibt standardmäßig bei Initialisierung. Für Produktion `types:false`; die vorhandene Option reicht dafür bereits. Komfortverbesserung im Paket: eigener Generate-Befehl, Prettier nur bei tatsächlich gewünschter Generierung laden, stabile Ausgabe und Schreiben nur bei Änderung. Kein Performanceproblem pro HTTP-Request behaupten: Scan und Formatierung liegen beim Start.

Bei mehreren separat gemounteten FSR-Bäumen braucht jeder Typoutput ein eigenes Ziel; anschließend den vollständigen Clientvertrag inklusive Mountpräfixen prüfen. Sonst kann eine Generierung die andere überschreiben.

### Tests und CI

Als erste Ergänzungen: kaputter Guard, Controllerreihenfolge, doppelte finale Pfade, Dotfiles, fehlender Root, ungültige Segmente, HTTP-Status bei Denial, POST-Body/Validation und clientseitige Typen für Ghost-/Catch-all-/Fehlerantworten. Kompatibilitätsmatrix für gepinnte Bun-/Elysia-Versionen und Test des tatsächlichen npm-Paketartefakts hinzufügen.

## Was ich bewusst nicht umbauen würde

- Kein eigenes Plugin-/Middlewareframework in FSR. Elysia bietet Hooks, Guards und Scopes bereits.
- Keine Session-, Cache-, DB- oder Billing-Abhängigkeit in den Router.
- Kein Service-Locator/DI-Container allein wegen der Dateirouten.
- Kein kompletter Routerneubau; kleine strikte Lade-/Kompositionsverbesserungen beheben die wesentlichen Probleme.
- Kein pauschaler Fork als erster Schritt. Änderungen lokal testen; Veröffentlichung eines Forks, Issues oder PRs wäre ein gesonderter Auftrag. Für den API-Plan ist ein exakt gepinnter kleiner Patch oder ein ausreichend enger Preflight möglich.

## Empfehlung für Webdock

FSR weiter als Routingkomfort einplanen. **Vor privatem Produktionsverkehr Befunde 1 und 2 absichern, Gruppenkomposition eindeutig machen und Protokollrouten explizit mounten.** Statische äußere Guards und ein vollständiges Routen-/Authmanifest sind zusätzlich nötig. Der [API-Plan](#file-01-api-rewrite-plan-md) enthält jetzt die konkrete Middleware-Reihenfolge, Scopes und Testmatrix.

Nicht geprüft: reales Netzwerk-/Traefikverhalten, Last, Windows-Dateisystem, alle Bun-/Elysia-Versionen, vollständige npm-Artefaktparität und echte Webdock-Auth-/Polarintegration. Die Tests belegen die beschriebenen lokalen Fälle, keine vollständige Produktionsfreigabe.
