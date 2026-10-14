import { msgid, type I18n } from "./core.ts";

// Exact source-text matching keeps custom or revised product copy unchanged.
const messages: Readonly<Record<string, string>> = {
  "Domainregistrierung / Verlängerung": msgid("Domain registration / renewal"),
  "Individuelles Angebot nach TLD- und Resellerkosten. Keine erfundenen Einheitspreise oder allgemeine Verfügbarkeitszusage.":
    msgid(
      "Individual quote based on TLD and reseller costs. No invented flat prices or blanket availability guarantees.",
    ),
  "Modulbetrieb Produktkatalog / Gastro": msgid(
    "Product catalog / restaurant module operation",
  ),
  "Laufender Modulbetrieb zusätzlich zu Website Plus, nach projektspezifischer Einrichtung. Kein vollständiger Shop mit Bestell-, Zahlungs- oder Versandabwicklung.":
    msgid(
      "Recurring module operation in addition to Website Plus, following project-specific setup. Not a complete shop with orders, payment or shipping.",
    ),
  "Modulbetrieb Termine & Anfragen": msgid("Appointments & enquiries"),
  "Laufender Modulbetrieb zusätzlich zu Website Plus, nach projektspezifischer Einrichtung. Keine externe Kalenderintegration oder Zahlungsverarbeitung enthalten.":
    msgid(
      "Recurring module operation in addition to Website Plus, following project-specific setup. External calendar integration and payment processing are excluded.",
    ),
  "BYOK-Verbindung einrichten": msgid("BYOK connection setup"),
  "Angebotsrahmen 99–299 EUR netto einmalig: Infrastrukturverbindung, Rechte-/Namespace-Prüfung und Dokumentation. Keine Providerkapazität oder allgemeine Kubernetes-Administration enthalten.":
    msgid(
      "Estimated EUR 99–299 excluding tax, one-time: infrastructure connection, permission/namespace checks and documentation. Provider capacity and general Kubernetes administration are excluded.",
    ),
  "App-Einrichtung": msgid("App setup"),
  "Einrichtung ab 49 EUR netto bei bereits passendem Container-Image. Migration, Codeanpassung sowie Domain/TLS nach ausdrücklich vereinbartem Aufwand.":
    msgid(
      "Setup from EUR 49 excluding tax with a suitable container image. Migration, code changes and domain/TLS work are billed according to explicitly agreed effort.",
    ),
  "Individuelle Entwicklung – 1 Stunde": msgid("Custom development – 1 hour"),
  "75 EUR netto je Stunde als Ausgangspunkt; kleine Änderungen in 15-Minuten-Schritten, größere Arbeiten als abgegrenztes Angebot. Betrieb und Ressourcen separat.":
    msgid(
      "EUR 75 excluding tax per hour as a starting point; small changes in 15-minute increments, larger tasks as a scoped quote. Operations and resources are separate.",
    ),
  "Bestehende Website umziehen": msgid("Existing website migration"),
  "Migration ab 149 EUR netto: Bestandsprüfung, begrenzter Import und Domainumschaltung. Komplexe CMS-Migration nach Aufwand; Website-Tarif separat.":
    msgid(
      "Migration from EUR 149 excluding tax: assessment, limited import and domain switch. Complex CMS migrations are billed by effort; website plan is separate.",
    ),
  "Bot online bringen": msgid("Bot setup"),
  "Einrichtung ab 99 EUR netto für einen qualifizierten Bot: Konfiguration, Healthcheck und Datenübernahme nach Prüfung. Laufender App-Standard-Tarif separat.":
    msgid(
      "Setup from EUR 99 excluding tax for an eligible bot: configuration, health check and data transfer after review. Recurring App Standard plan is separate.",
    ),
  "Produktkatalog / Gastro-Demo einrichten": msgid(
    "Product catalog / restaurant demo setup",
  ),
  "Angebotsrahmen 990–2.490 EUR netto: Produkte, Varianten/Extras, Inhalte und Administration. Website Plus und Modulbetrieb separat; echte Bestellungen und Payment sind ein Folgeprojekt.":
    msgid(
      "Estimated EUR 990–2,490 excluding tax: products, variants/extras, content and administration. Website Plus and module operation are separate; real orders and payment require a follow-up project.",
    ),
  "Termine & Anfragen einrichten": msgid("Appointments and enquiries setup"),
  "Angebotsrahmen 990–1.990 EUR netto: angepasster Anfrage-/Kalenderablauf. Website Plus und Modulbetrieb separat; keine Zahlung oder externe Kalendersynchronisierung enthalten.":
    msgid(
      "Estimated EUR 990–1,990 excluding tax: customized enquiry/calendar flow. Website Plus and module operation are separate; payment and external calendar synchronization are excluded.",
    ),
  "Unternehmenswebsite einrichten": msgid("Business website setup"),
  "Angebotsrahmen 699–1.490 EUR netto: individuelle Anpassung, bis 5 Seiten, Kontaktanfrage und CMS-Einweisung. Website Basic/Plus separat abrechnen.":
    msgid(
      "Estimated EUR 699–1,490 excluding tax: custom adjustments, up to 5 pages, contact enquiry and CMS introduction. Website Basic/Plus is billed separately.",
    ),
  "Vereins-/Visitenkarten-Website einrichten": msgid(
    "Club / brochure website setup",
  ),
  "Angebotsrahmen 249–499 EUR netto: bestehende Vorlage, bis 5 Inhaltsbereiche, angelieferte Texte/Bilder und eine Korrekturrunde. Laufender Website-Tarif separat.":
    msgid(
      "Estimated EUR 249–499 excluding tax: existing template, up to 5 content sections, supplied text/images and one revision round. Recurring website plan is separate.",
    ),
  "Mailbox Basic": msgid("Mailbox Basic"),
  "Vorläufiges Angebot: 2,90–4,90 EUR netto pro Postfach/Monat für 2–5 GB. Preis und Betriebsumfang offen; Eingang, Ausgang, Anti-Spam, Zugang und Wiederherstellung vor Freigabe vollständig abnehmen.":
    msgid(
      "Provisional quote: EUR 2.90–4.90 excluding tax per mailbox/month for 2–5 GB. Pricing and operational scope are pending; fully verify incoming and outgoing mail, anti-spam, access and recovery before approval.",
    ),
  "PostgreSQL eigene Instanz Standard": msgid("Postgres Dedicated Standard"),
  "Eigene PostgreSQL-Instanz: 1 CPU, 2 GiB RAM und 20 GiB Dateisystem. Lastqualifizierung und Betriebsabnahme erforderlich; Backup/Restore nicht ungeprüft zusagen.":
    msgid(
      "Dedicated PostgreSQL instance: 1 CPU, 2 GiB RAM and 20 GiB filesystem. Load qualification and operational acceptance are required; do not promise unverified backup or restore capabilities.",
    ),
  "PostgreSQL eigene Instanz Starter": msgid("PostgreSQL Dedicated Starter"),
  "Eigene PostgreSQL-Instanz: 0,5 CPU, 1 GiB RAM und 10 GiB Dateisystem. Kein ungeprüftes Restore-Fenster oder SLA; Betriebsfreigabe nach Abnahme.":
    msgid(
      "Dedicated PostgreSQL instance: 0.5 CPU, 1 GiB RAM and 10 GiB filesystem. No unverified recovery window or SLA; operational approval follows acceptance testing.",
    ),
  "PostgreSQL Shared": msgid("PostgreSQL Shared"),
  "Eigene SQL-Datenbank und Rollen im gemeinsamen Pool; 1 GiB logisches Kontingent, keine eigene RAM-Garantie. TLS, Isolation, Quoten, Überwachung sowie Backup/Restore vor öffentlicher Freigabe abnehmen.":
    msgid(
      "A separate SQL database and roles in a shared pool; 1 GiB logical quota, no dedicated RAM guarantee. Verify TLS, isolation, quotas, monitoring, backup and restore before public approval.",
    ),
  Pflegebudget: msgid("Maintenance allowance"),
  "45 Minuten pro Monat für Inhalte oder kleine Konfigurationsarbeiten. Abgegrenzter Umfang, keine Neuentwicklung oder allgemeine Support-Flatrate.":
    msgid(
      "45 minutes per month for content or minor configuration work. Defined scope; no new development or unlimited support.",
    ),
  "Kleines Änderungsbudget": msgid("Small changes allowance"),
  "20 Minuten pro Monat für ausdrücklich vereinbarte Änderungen. Nicht übertragbar; Mehrarbeit nur nach Vereinbarung, keine Neuentwicklung enthalten.":
    msgid(
      "20 minutes per month for explicitly agreed changes. Unused time does not roll over; additional work requires agreement, and new development is excluded.",
    ),
  Domainanschluss: msgid("Domain connection"),
  "Anschluss einer vorhandenen Kundendomain einschließlich DNS-Prüfung. Kein Domainkauf, Transfer oder Verlängerungspreis enthalten.":
    msgid(
      "Connect an existing customer domain, including DNS verification. Domain purchase, transfer and renewal fees are excluded.",
    ),
  "Zusätzlicher CMS-Editor": msgid("Additional CMS editor"),
  "Ein zusätzlicher CMS-Bearbeiter für eine berechtigte Website. Keine Betreuungszeit enthalten.":
    msgid(
      "One additional CMS editor for an eligible website. Support time is not included.",
    ),
  "Medienspeicher +1 GB": msgid("Media storage +1 GB"),
  "Zusätzlich 1 GB dezimaler CMS-Medienspeicher einschließlich erzeugter Varianten. Kein persistentes App-Volume; tatsächliche Blob-Kosten vor Freigabe prüfen.":
    msgid(
      "An additional 1 GB of decimal CMS media storage, including generated variants. Not a persistent app volume; verify actual Blob costs before approval.",
    ),
  "Mail Plus": msgid("Mail Plus"),
  "25.000 ausgehende E-Mails pro Monat, nur bei nachgewiesenem und reserviertem Poolbudget. Keine Inbox und kein allgemeines Kampagnen- oder Zustellversprechen.":
    msgid(
      "25,000 outgoing emails per month, subject to verified and reserved pool capacity. No inbox or general campaign or delivery guarantee.",
    ),
  "Mail Standard": msgid("Mail Standard"),
  "10.000 ausgehende E-Mails pro Monat; kein Postfach. Abrechnungsperiode, Zählweise und gemeinsames Providerbudget vor Freigabe bestätigen.":
    msgid(
      "10,000 outgoing emails per month; no mailbox. Confirm the billing period, counting rules and shared provider budget before approval.",
    ),
  "Mail Small": msgid("Mail Small"),
  "1.000 ausgehende E-Mails pro Monat; kein Postfach. Kontingent und Providerquota vor Freigabe passend reservieren; enthaltene Website-Mengen nicht doppelt zusagen.":
    msgid(
      "1,000 outgoing emails per month; no mailbox. Reserve matching service and provider quotas before approval; do not promise included website allowances twice.",
    ),
  "Enterprise / individuelles Betriebskonzept": msgid(
    "Enterprise / custom operations",
  ),
  "Individuelles Onboarding, Zugriffs- und Betriebskonzept, Migration und gegebenenfalls zusätzliche Isolation. SLA und Reaktionszeiten nur nach gesonderter Qualifizierung und Kalkulation.":
    msgid(
      "Individual onboarding, access and operations plan, migration and additional isolation where agreed. SLAs and response times require separate qualification and pricing.",
    ),
  "Managed Connect": msgid("Managed Connect"),
  "Angebot ab 79,90 EUR netto/Monat: Connect Team plus 30 Minuten vereinbarte Betriebsbetreuung. Kein pauschales OS-/Cluster-Management oder SLA.":
    msgid(
      "Quote from EUR 79.90 excluding tax/month: Connect Team plus 30 minutes of agreed operational support. No general OS/cluster management or SLA.",
    ),
  "Connect Team": msgid("Connect Team"),
  "Bis 2 eigene Infrastrukturverbindungen und 10 eingebundene Projekte/Workloads. Providerkosten nicht enthalten; unterstützte Steuerung und Einrichtung gesondert vereinbaren.":
    msgid(
      "Up to 2 customer-owned infrastructure connections and 10 connected projects/workloads. Provider costs are excluded; supported management and setup must be agreed separately.",
    ),
  Connect: msgid("Connect"),
  "1 eigenes Vercel-Team oder 1 eigener Kubernetes-Cluster, bis 3 ausdrücklich eingebundene Projekte/Workloads. Providerkapazität und Providerrechnung bleiben beim Kunden; Einrichtung separat.":
    msgid(
      "1 customer-owned Vercel team or Kubernetes cluster, up to 3 explicitly connected projects/workloads. Provider capacity and billing remain the customer's responsibility; setup is separate.",
    ),
  "App Custom": msgid("App Custom"),
  "Individuelles Angebot für ausdrücklich vereinbarte App-, CPU-, RAM- und Speichermengen. Keine pauschale Ressourcen- oder Preiszusage.":
    msgid(
      "Individual quote for explicitly agreed app, CPU, RAM and storage quantities. No blanket resource or price commitment.",
    ),
  "App Plus": msgid("App Plus"),
  "1 App / 1 Replikat; 1 CPU, 2 GB RAM, 10 GB persistentes /data und 2 GB temporärer Speicher (dezimal). Kapazität und Platzierung vor Annahme prüfen; keine HA oder Backups enthalten.":
    msgid(
      "1 app / 1 replica; 1 CPU, 2 GB RAM, 10 GB persistent /data and 2 GB temporary storage (decimal). Confirm capacity and placement before acceptance; no high availability or backups included.",
    ),
  "App Standard": msgid("App Standard"),
  "1 App / 1 Replikat; 0,5 CPU, 1 GB RAM, 5 GB persistentes /data und 1 GB temporärer Speicher (dezimal). Geteilte Nodes; Einrichtung separat, kein Backup oder Datenbank enthalten.":
    msgid(
      "1 app / 1 replica; 0.5 CPU, 1 GB RAM, 5 GB persistent /data and 1 GB temporary storage (decimal). Shared nodes; setup is separate, no backups or database included.",
    ),
  "App Mini": msgid("App Mini"),
  "1 App / 1 Replikat; 0,25 CPU, 512 MB RAM, 1 GB persistentes /data und 1 GB temporärer Speicher (dezimal). Betreute Einrichtung separat; kein Backup, keine eigene Datenbank und keine HA enthalten.":
    msgid(
      "1 app / 1 replica; 0.25 CPU, 512 MB RAM, 1 GB persistent /data and 1 GB temporary storage (decimal). Managed setup is separate; no backups, dedicated database or high availability included.",
    ),
  "Website Plus": msgid("Website Plus"),
  "1 Website, 5 Redakteure, 5.000 MB Medienspeicher (dezimal) und 3.000 ausgehende E-Mails pro Monat.":
    msgid(
      "1 website, 5 editors, 5000 MB media storage (decimal), 3000 outgoing emails per month.",
    ),
  "Website Basic": msgid("Website Basic"),
  "1 Website, 3 Redakteure, 2.000 MB Medienspeicher (dezimal) und 1.000 ausgehende E-Mails pro Monat.":
    msgid(
      "1 website, 3 editors, 2000 MB media storage (decimal), 1000 outgoing emails per month.",
    ),
  "Website Mini": msgid("Website Mini"),
  "1 Website, 1 Redakteur, 500 MB Medienspeicher (dezimal) und 100 ausgehende E-Mails pro Monat.":
    msgid(
      "1 website, 1 editor, 500 MB media storage (decimal), 100 outgoing emails per month.",
    ),
};

export function billingProductText(i18n: I18n, text: string): string {
  return Object.hasOwn(messages, text) ? i18n.t(messages[text]) : text;
}

export function bilingualProductText(text: string, separator = " / "): string {
  const english = Object.hasOwn(messages, text) ? messages[text] : text;
  return english === text ? text : text + separator + english;
}
