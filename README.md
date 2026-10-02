# Webdock

Eigenständige Landingpage für **webdock.dev**. Next.js 16 App Router, React 19 und Tailwind CSS 4. Statisch vorgerenderte Inhalte, lokale Space-Grotesk-Schrift, native FAQ-Akkordeons und keine zusätzlichen UI-Abhängigkeiten.

```bash
nvm use
npm ci
npm run dev -- --port 3101
```

Die Darstellung folgt standardmäßig dem Betriebssystem. Im Footer lassen sich Hell, Dunkel oder System wählen; eine manuelle Auswahl bleibt lokal im Browser gespeichert.

## Inhalt und Gestaltung

- `src/app/page.tsx`: Landingpage und JSON-LD (WebSite, Organization, FAQPage).
- `src/lib/content.ts`: Kontaktadresse und FAQ; sichtbare Antworten und strukturierte Daten teilen dieselbe Quelle.
- `src/components/dock.tsx`: illustrative Dock-Grafik, keine echten Kundenprojekte.
- `tokens.css`, `src/app/globals.css`: Gestaltung und responsive Layouts.
- `public/logo.svg`, `public/icon.svg`, `public/og.png`: Markenassets; das ICO liegt in `src/app/favicon.ico`.
- `src/app/layout.tsx`, `robots.ts`, `sitemap.ts`: Canonical, Social-Metadaten und Crawler-Dateien.

Die Console wird nur als geplante Erweiterung beschrieben. Keine Anmeldung, Provisionierung, Kundendaten oder Hosting-API sind implementiert. Kontaktbuttons öffnen den E-Mail-Client.

## Prüfen

```bash
npm run lint
npm run build
npm run start -- --port 3101
# In einem zweiten Terminal:
npm test
```

`TEST_BASE_URL` überschreibt die Testadresse. Browserprüfung zusätzlich bei 320, 375, 414, 768 und 1280 Pixeln: Überlauf, FAQ, Tastaturfokus, Ankerlinks und Darstellung.

## Veröffentlichung

In Vercel dieses Verzeichnis als Root Directory auswählen, Node.js 24 verwenden und webdock.dev dem Projekt zuordnen. Keine Umgebungsvariablen nötig. Alternativ funktioniert der normale Next.js-Node-Server (`npm run build && npm start`) auch bei anderen Anbietern.

Canonical und Sitemap zeigen bewusst auf https://webdock.dev. Vorschau-Deployments auf der Hosting-Ebene vor Indexierung schützen. Die Landingpage setzt keine Analytics oder Cookies ein. Vor Veröffentlichung fehlen noch die abgestimmten Betreiber-/Impressums- und Datenschutzangaben; hierfür wurden keine Daten erfunden. Auf spitzli.dev muss der Gegenlink noch an geeigneter Stelle ergänzt werden.

Die Vercel CLI lässt sich bei Bedarf mit `npm i -g vercel` installieren; danach stehen `vercel deploy`, `vercel env pull` und `vercel logs` zur Verfügung.
