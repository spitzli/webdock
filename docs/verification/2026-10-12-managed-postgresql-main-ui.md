# Managed PostgreSQL integration with main

Integrated `origin/main` at `29dfa74` by fast-forward from `4ee759c`. Main's workspace navigation, context, account menu, Mail changes and responsive controls take precedence. The pre-integration PostgreSQL changes are preserved in the local safety stash.

PostgreSQL now uses the existing `AreaNavigation`, `WorkspaceContext` and project context:

- One customer Databases area, with data browsing and Managed PostgreSQL sections.
- Project Databases tab and contextual links; no duplicate standalone project button.
- Database overview, connection credentials and settings have separate URLs.
- Operator installation and catalog views are separate; creation forms use existing disclosures.
- Billing appears once within main's Usage view; plan and measurement-source views remain intact.
- Preview shows only authorized overview data and rejects direct settings access.

Verified in the native browser on the isolated local fixture: desktop, mobile 320px without horizontal overflow, expanded mobile navigation, installation/catalog navigation, project and tenant directories, credential view, and read-only preview. The fixture's missing pre-existing data-browser schema was migrated locally with the existing explicit migration runner.

Validation: 224 Auth tests, 115 Studio tests and 17 contract tests passed. Both production builds and both app lints passed. The imported Mail migration test used a fixed local port; it now derives its explicit target from the already-guarded disposable database URL. Production migration safety checks are unchanged.

No production rollout, push or PR. Backups remain deferred. The separate 24-hour local PostgreSQL observation continues; this UI check does not claim that observation has finished.
