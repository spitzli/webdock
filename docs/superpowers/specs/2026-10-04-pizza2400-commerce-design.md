# Pizza2400: eigenständiger Webdock-Mandant mit Commerce

Status: konkreter Designvorschlag zur Durchsicht. Recherche vom 04.10.2026; noch keine Website, Infrastruktur oder Zahlungsanbindung umgesetzt. Der Nutzer hat Pizza2400 in Rastede bestätigt. Die erste Veröffentlichung soll eine Demo mit simulierten Zahlungen sein.

## Ziel

Pizza2400 erhält eine eigenständige, hochwertige Restaurant-Website unter `pizza2400.webdock.dev`, eine eigene Payload-Instanz und einen Eintrag im Webdock-Mandantenbereich. Inhalte und Speisekarte sind redaktionell pflegbar. Die Startseite hat einen eigenen Charakter; die wiederverwendbaren Commerce-Funktionen können später auch andere Webdock-Projekte nutzen.

Erfolg heißt: Auf dem Handy ein Produkt finden, konfigurieren, in den Warenkorb legen und eine klar als solche markierte Testbestellung abschließen. Wiederkehrende Kunden können Adressen und frühere Bestellungen aufrufen. Die Gestaltung und die vollständige Demo haben Vorrang vor echtem Zahlungsverkehr.

## Recherche und bestehende Grenzen

- `https://pizza2400.com` führt zur aktuellen Website `https://www.pizza2400.de/`. Ein einfacher Webabruf zeigt eine Passwortansicht, der Browser lädt hingegen ohne Passwort einen funktionierenden Flutter-Shop. Das ist keine bestätigte Zugangssperre.
- Im Browser sichtbar: Startseite, Speisekarte, Warenkorb, Account; Kategorien für Pizza, Burger, Salate, Fingerfood, Baguette, Pizzabrötchen, Dips, Getränke und Desserts. Suchfeld sowie Filter für Bestseller, Halal, Scharf, Vegan und Vegetarisch sind vorhanden. Die neue Website muss diese vorhandene Funktionalität sinnvoll berücksichtigen.
- Die aktuelle Startseite besteht im Wesentlichen aus grauen Kategorien-Kacheln und vier gleichgewichteten Bestsellerkarten. Die Produktbilder sind präsent, aber es fehlt eine eigenständige Markeninszenierung. Kleine grüne Preisangaben auf grauen Flächen und die geringe Hierarchie erschweren das Scannen. Diese Aussagen sind gestalterische Beobachtungen, keine gemessenen Conversion- oder Performance-Ergebnisse.
- Auf der Website angezeigt: Mo–So 17:00–21:00 Uhr. Direkte Shop-Beispiele: Margherita ab 7,00 €, Salami ab 9,20 €, Salami Deluxe ab 13,80 €, Cheeseburger ab 9,50 €. Größen und Bedingungen müssen vor einem vollständigen Import geprüft werden.
- Die Lieferando-betriebene Seite `https://www.pizza2400-rastede.de/` enthält abweichende Preise, beispielsweise 8,40 € für Margherita. Die Datenquellen werden nicht zu einer vermeintlich verbindlichen Preisliste vermischt. Preise in der Demo sind als Demo-/Recherchebestand gekennzeichnet; ein späterer echter Shop benötigt die vom Betreiber bestätigte Karte.
- Öffentliche Geschäftsdaten nennen Raiffeisenstraße 36, 26180 Rastede und 04402 2400. Liefergebiete, Mindestbestellwerte, Liefergebühren und belastbare Lieferzeiten sind noch nicht bestätigt. Für die Demo werden solche Werte ausdrücklich als Simulationswerte gepflegt, nicht als Geschäftsversprechen ausgegeben.
- Webdock hat bereits eine Kunden-/Projekt-/CMS-Registry, zentrale Better-Auth-Anmeldung und eigenständige Website-CMS. `README.md` beschreibt ausdrücklich separate Repositories für Kundenwebsites. Ein Registry-Eintrag provisioniert noch keine Website. `writeInstance` verlangt eine tatsächlich bereitgestellte CMS-Instanz; vorab darf kein aktiver CMS-Eintrag erfunden werden.
- Neue Registry-Kunden werden über `webdock_auth.sync_customer_tenant` bestehenden Tenant-Strukturen zugeordnet. Diesen Pfad verwenden, keine zweite konkurrierende Mandantenverwaltung bauen.

## Architekturentscheidung

### Empfehlung: eigene Website, kleine optionale Commerce-Module

Ein eigenes Repository und Vercel-Projekt für Pizza2400, eigene Payload-Konfiguration, eigenes Datenbankschema mit eingeschränktem Runtime-Login und eigene Medienablage. Webdock bleibt die Verwaltung von Mandant, Projekt, CMS-Verbindung und Betrieb. `apps/web` wird nicht um Pizza-Routen erweitert.

Gemeinsame, versionierbare Bausteine übernehmen Endkunden, Adressen, Bestellungen und Provider-Anbindung. Pizza2400 besitzt das Frontend sowie Restaurant-Felder wie Größen, Extras, Abholung/Lieferung und Öffnungszeiten. Nur benötigte Module werden aktiviert. Der erste Konsument liefert die Anforderungen; kein generischer Shop-Builder, Plugin-Marktplatz oder dynamischer Collection-Designer in dieser Phase.

Alternativen:

1. Alles ausschließlich im Pizza-Repository implementieren: schnell, aber Kundenkonten und Zahlungslogik müssten beim nächsten Mandanten kopiert werden. Geeignet für die individuelle Oberfläche, nicht für die bewusst gewünschte Wiederverwendung.
2. Ein zentraler mandantenfähiger Shop für alle Websites: zentrale Updates, aber größere Umstellung der bestehenden Isolation, mehr Risiken bei Zugriffsfehlern und weniger gestalterische Freiheit. Für diesen Auftrag unverhältnismäßig.

Die Empfehlung bewahrt die vorhandene Webdock-Architektur und macht die konkret benötigten Funktionen teilbar. Bestehende Policy-/SSO-Bausteine werden nach dem vorhandenen Muster eingebunden; keine neue Runtime-Abhängigkeit vom Control Plane für jede Bestellung.

## Gestaltung und Bestell-UX

Visuelle Richtung: Tomatenrot als starker Markenanker, warmer heller Hintergrund, dunkle gut lesbare Schrift, kompakte kräftige Display-Typografie, große appetitliche Fotografie. Eine direkte lokale Marke statt austauschbarer Restaurantromantik. Entwurf für die Leitzeile: „Rastede. Dein Abend. Deine Pizza.“ Keine erfundenen Bewertungen, Herkunftsversprechen, Ofenarten oder Lieferzeit-Garantien.

Startseite: eigenständige asymmetrische Komposition mit großem Produktmotiv und klarer Aktion „Speisekarte ansehen“. Direkt zugänglich sind Lieferung/Abholung, Warenkorb und Konto. Danach eine kuratierte Auswahl tatsächlicher Produkte, eine kompakte Kategorieführung und Standort/Öffnungszeiten. Nicht jede Sektion wird zu einem identischen Kartenraster.

Speisekarte: auf Desktop gut lesbare Produktliste mit Warenkorbübersicht; mobil kompakte Kategorienavigation und fixierte Warenkorb-Aktion mit Artikelzahl und Gesamtpreis. Suche und sinnvolle Ernährungsfilter bleiben erhalten. Nur bestätigte Produktkennzeichnungen anzeigen; Zutaten sind kein verlässlicher Ersatz für bestätigte Allergendaten.

Produktansicht: Größe, verfügbare Extras, Zutaten und Allergeninformationen, Menge und ein sofort aktualisierter Gesamtpreis. Pflichtauswahlen werden klar bezeichnet. Nicht verfügbare Produkte bleiben verständlich gekennzeichnet. Auf Mobilgeräten ein zugänglicher Dialog/Drawer mit Fokusführung, Escape/Schließen und Rückkehr zum Ausgangspunkt.

Checkout: Bestellung prüfen → Lieferung oder Abholung und notwendige Kontaktdaten → simulierte Zahlung → Testbestätigung. Kein erzwungenes Konto. Kontoerstellung wird als optionaler Vorteil angeboten. Im Checkout keine ablenkenden Marketing-Sektionen und keine überraschenden Gebühren.

Alle Geräte: Tastaturbedienung, sichtbare Fokuszustände, beschriftete Felder, Fehlermeldungen am Feld und als Zusammenfassung, ausreichende Kontraste, reduzierte Bewegung nach Systemeinstellung. Prüfung bei 320, 375, 414, 768 und 1440 Pixeln. Dialoge und feste Warenkorb-Elemente dürfen weder Fokus noch wichtige Inhalte verdecken.

## CMS-Modell

Payload ist die Quelle für redaktionelle Inhalte und den bestellbaren Katalog, nicht nur ein nachträglich verlinktes Admin-Panel.

| Bereich | Inhalt und Zuständigkeit |
| --- | --- |
| `site-settings` | Name, Logo, Kontakt, Standort, Öffnungszeiten, Demo-Hinweise, Social-Links |
| `homepage` | Überschrift, Einleitung, Bild, kuratierte Produktauswahl, redaktionelle Abschnitte |
| `pages` | Einfache Inhaltsseiten mit wenigen tatsächlich unterstützten Blöcken, SEO, Entwurf/Veröffentlichung |
| `media` | Eigene Medien mit Alt-Text, Herkunft/Rechtenachweis und projektgebundenem Speicher |
| `categories`, `products` | Reihenfolge, Zutaten, bestätigte Kennzeichnungen, Bilder, Größen/Varianten, Extras, Cent-Preise, Verfügbarkeit |
| `restaurant-settings` | Lieferung/Abholung, bestätigte Lieferzonen, Gebühren, Mindestwert, Sonderöffnungszeiten; Demo-Werte klar getrennt |
| `shop-customers`, `addresses` | Endkundenidentität und adressbezogene Daten, strikt je Konto geschützt |
| `orders` | Bestellpositionen und Preissnapshot, Erfüllungsart, Status, Provider-Referenzen, unveränderliche Demo-Markierung |

Redaktionelle Inhalte unterstützen Vorschau und Veröffentlichung. Produktpreise und Verfügbarkeit werden beim Checkout serverseitig erneut gelesen. Ein Browser darf keine verbindlichen Preise oder Statuswerte vorgeben. Beträge werden als ganze Cent-Beträge berechnet. Historische Bestellungen behalten Produkt-/Preis-/Adress-Snapshots, auch wenn später CMS-Daten verändert werden.

CMS-Personal darf Inhalte bearbeiten; Zahlungsgeheimnisse und Plattformrollen sind keine normalen redaktionellen Felder. Endkunden erhalten keinerlei Payload-Adminrechte. Bestehende Webdock-Operator-Policy und SSO-Konventionen bleiben erhalten.

## Zwei verschiedene Arten von Kundenkonto

1. **Webdock-Mandant und Mitarbeiter:** zentrale Webdock-Identität für Betreiber, Redakteure und Administratoren; Zugriff auf Studio/CMS nach bestehenden Grants.
2. **Pizza2400-Endkunde:** Anmeldung unter der Pizza2400-Website, ohne Webdock-Studio-Konto oder Organisationsmitgliedschaft. Eigene Konto-ID, Sessions und Zugriffsregeln in der Website-Instanz.

Für die erste Instanz liegt eine separate Payload-Auth-Collection für Shop-Kunden nahe: Sie ist bereits Bestandteil des benötigten Stacks und vermeidet einen zweiten selbst betriebenen Auth-Dienst pro Website. Die konkrete Verträglichkeit mit der installierten Payload-Version und dem Admin-SSO wird vor Implementierung geprüft. Nicht einfach die geschützte CMS-Users-Collection für öffentliche Registrierungen öffnen.

Das Kundenkonto bietet Registrierung/Anmeldung/Abmeldung, Passwortwiederherstellung, Profil, Adressbuch, eigene Bestellungen und erneutes Bestellen zu aktuell geltenden Preisen. E-Mail-Verifikation und Recovery werden vor öffentlicher Registrierung mit dem vorgesehenen Mail-Setup geprüft. Solange das nicht konfiguriert ist, hat die Design-Demo ein ausdrücklich simuliertes Konto mit synthetischen Daten; keine scheinbar versendeten E-Mails oder vorgetäuschte sichere Anmeldung.

Sessions sind hostgebunden; kein gemeinsamer `.webdock.dev`-Cookie für Endkunden. Autorisierung erfolgt bei jedem Zugriff. Adress-/Bestell-IDs sind kein Zugriffsnachweis. Rate-Limits, generische Login-Fehler, Origin-Prüfung/CSRF-Schutz und serverseitige Validierung gehören zum funktionalen Konto. Eine identische E-Mail bei zwei Mandanten erzeugt keine mandantenübergreifende Berechtigung.

## Payments: Demo zuerst, BYOK je Projekt

Provider-Modi: `demo`, `stripe`, `polar`. In der ersten Pizza2400-Veröffentlichung ist ausschließlich `demo` aktiv. Die Live-Auswahl wird erst nach Implementierung und Prüfung des jeweiligen Providers freigeschaltet. Eine Auswahl im CMS allein ist noch keine funktionierende Integration.

**Demo:** prominenter, unaufdringlicher Hinweis „Demo – keine echte Bestellung oder Zahlung“. Checkout-Aktion „Testbestellung abschließen“. Keine echten Kartendaten abfragen. Erfolgreiche, abgelehnte und abgebrochene Zahlung sind mit synthetischen Szenarien prüfbar. Persistierte Demo-Bestellungen tragen dauerhaft `mode=demo`; keine Küchenbenachrichtigung, kein Restaurantkontakt, keine Zahlungs-API. Demo-Routen sind bei späterem Live-Betrieb serverseitig deaktiviert. Demo-Daten werden nicht durch Umschalten zu echten Umsätzen.

**Stripe:** Betreiber bringt eigenen Stripe-Account und serverseitige Zugangsdaten mit. Kundendaten und PaymentMethod-Referenzen sind an diesen Provider-Account und dieses Projekt gebunden. Kartennummer und CVC werden von Stripe erfasst; Webdock speichert keine Rohkartendaten. Zahlungsmittel werden nur mit ausdrücklicher Zustimmung gespeichert und wiederverwendet. Gehosteter Checkout ist der erste Integrationspfad; eine eingebettete Stripe-Oberfläche ist eine spätere UX-Entscheidung.

**Polar:** nur für zulässige digitale Produkte anderer Mandanten. Die aktuelle Acceptable Use Policy schließt physische Produkte und Marktplätze aus. Pizza2400 kann deshalb keinen Polar-Live-Checkout aktivieren. Für geeignete andere Websites verwendet jeder Anbieter seinen eigenen Polar-Seller-Account und Organization Access Token; Webdock betreibt dadurch nicht stillschweigend einen Sammelaccount/Marktplatz. Portal- und Checkout-Funktionen werden gemäß Polar-Fähigkeiten angeboten, nicht als identische Stripe-Funktionen ausgegeben. Eignung des konkreten Angebots ist vor Aktivierung zu prüfen.

BYOK-Geheimnisse gehören verschlüsselt in einen serverseitigen Credential-Speicher oder in die isolierte Projekt-Umgebung. Im Control Plane liegen Status und Secret-Referenzen, niemals lesbare Schlüssel in kundenzugänglichen Records, CMS-Antworten, Logs oder Client-Bundles. Test- und Live-Zugangsdaten sowie Webhook-Secrets bleiben getrennt. Wechsel des Provider-Accounts migriert keine gespeicherten Zahlungsmittel automatisch.

Die gemeinsame Schnittstelle bleibt klein: Checkout erzeugen, Zahlungsereignis verifizieren/zuordnen, optionale Zahlungsmittel-/Portalverwaltung. Provider-Fähigkeiten wie physische Waren, gespeicherte Zahlungsmittel oder Abonnements werden explizit ausgewertet. Kein Stripe-förmiges Datenmodell, das Polar nur oberflächlich nachahmt.

Live-Bestellstatus wird ausschließlich durch verifizierte Provider-Ereignisse bzw. serverseitige Provider-Abfrage geändert, nie allein durch die Rückkehr-URL. Signierte Webhooks, Account-/Umgebungs-/Bestellzuordnung, Idempotenz und atomare Statusübergänge verhindern doppelte Bestellungen und falsche Zahlungsbestätigungen. Ein bezahlter Auftrag und eine vom Restaurant angenommene Bestellung sind getrennte Zustände.

## Bereitstellung und konkrete Änderungsgrenzen

Geplantes neues Website-Repository: `pizza2400`, lokal als Geschwisterverzeichnis von `webdock`, mit eigener Next.js-/Payload-App. Geplante Domain: `pizza2400.webdock.dev`. Vor der Einrichtung vorhandene Projekte/DNS-Einträge prüfen und wiederverwenden, sofern sie eindeutig dazugehören.

Im Webdock-Repository: versionierte gemeinsame Commerce-Bausteine erst für die konkret verwendeten Funktionen; explizite, wiederholbare Registrierungs-/Provisionierungsoperationen; Architektur-/Betriebsdokumentation. Registry-Daten über bestehende validierte Schreibpfade und Audit-Mechanismen. Kein Umbau der Webdock-Marketingseite und keine Löschung vorhandener Dateien.

Ablauf:

1. Eigenständige lokale Pizza2400-App und Inhaltsmodell anlegen; sichere, getrennte lokale Datenbank und Seed-Daten verwenden.
2. Durchgängige visuelle Demo mit Speisekarte, Produktkonfiguration, Warenkorb, simuliertem Konto und Checkout herstellen und im Browser prüfen.
3. Payload-Pflege und echte isolierte Endkundenkonten anschließen; automatisierte Autorisierungs-/Checkout-Tests ausführen. Mail-Funktionen erst nach geprüftem Setup aktivieren.
4. Pizza2400-Kunden-/Projektdatensatz idempotent anlegen. Keine erfundenen Ansprechpartner und keine Einladung oder E-Mail an den Betrieb senden.
5. Eigene Runtime-Rolle/-Schema, Medienablage, SSO-Binding und Vercel-Projekt bereitstellen. Versionierte Migrationen ausdrücklich ausführen; keine Schema-Mutation beim Serverstart. Produktions-Credentials niemals in Vorschau-/Testumgebungen kopieren.
6. Bereitgestellte App und CMS prüfen, dann Subdomain zuordnen und tatsächliche CMS-Verbindung registrieren. Demo `noindex` setzen; die bestehende Restaurant-Domain bleibt unberührt.

Wiederholungen prüfen vorhandene Ressourcen und verwenden gespeicherte IDs. Fehler führen nicht zur Löschung vorhandener Mandanten-Daten. Ohne verfügbare Infrastrukturzugänge bleibt ein reproduzierbares lokales Ergebnis; ein fehlender Live-Schritt wird konkret benannt und nicht als erledigt ausgewiesen.

## Abnahme und Folgeschritte

- Startseite und vollständiger Bestellfluss funktionieren auf Desktop und Mobilgeräten; leerer Warenkorb, Pflichtauswahl, ungültige Adresse, nicht verfügbares Produkt sowie abgebrochene/fehlgeschlagene Simulation haben verständliche Zustände.
- CMS-Änderungen an Hero, Produktname, Preis, Bild und Verfügbarkeit erscheinen im Frontend. Nicht veröffentlichte Inhalte bleiben öffentlich unsichtbar.
- Preise, Mengen, Extras und Lieferbedingungen werden serverseitig validiert; ein manipuliertes Browser-Payload und paralleles Absenden erzeugen keine falschen Beträge oder Doppelbestellungen.
- Zwei Endkunden können gegenseitig weder Adressen noch Bestellungen lesen/ändern. Endkunden kommen nicht ins CMS. Bestehende Webdock-SSO-/Registry-Tests bleiben intakt.
- Demo-Zahlungen erreichen keine echten Provider oder Restaurant-Systeme. Keine Rohkartendaten werden angenommen oder gespeichert. Polar ist für physische Produkte nicht aktivierbar.
- Domain, HTTPS, CMS-Zugang und Registry-Verknüpfung werden nach tatsächlicher Bereitstellung überprüft.

Echte Stripe-Zahlungen sind ein separater nächster Release nach Betreiberabnahme von Produkten, Preisen, Lieferbedingungen, Rechtstexten und Bestellbearbeitung. Polar-Live-Unterstützung wird mit einem passenden digitalen Mandanten umgesetzt und getestet. Diese Demo verlangt keine Stripe-/Polar-Schlüssel vom Nutzer.

## Quellen und lokale Evidenz

- [Pizza2400 Direktshop](https://www.pizza2400.de/) — Browserprüfung von Startseite und Speisekarte am 04.10.2026.
- [Lieferando-betriebene Speisekarte](https://www.pizza2400-rastede.de/) — unabhängiger Verkaufskanal; Preise nicht mit Direktshop vermischen.
- [Polar Acceptable Use Policy](https://polar.sh/legal/acceptable-use-policy) — physische Produkte und Marktplätze ausgeschlossen.
- [Polar Checkout API](https://polar.sh/docs/api-reference/checkouts/create-session) und [Customer Sessions](https://polar.sh/docs/api-reference/customer-portal/sessions/create) — organisationsgebundene API und Portalzugriff.
- [Stripe: Save payment details during payment](https://docs.stripe.com/payments/checkout/save-during-payment) — offizieller Einstieg in gespeicherte Zahlungsmittel.
- Lokale Implementierung: `README.md`, `apps/admin/src/lib/registry.ts`, `apps/admin/src/cms/collections.ts`, `apps/auth/src/lib/tenant-schema.ts`, `apps/auth/src/lib/tenants.ts`, `packages/instance-kit/README.md`, `docs/superpowers/specs/2026-10-04-tenant-plans-usage-design.md`.
