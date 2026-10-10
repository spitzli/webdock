# Webdock CMS design

Scope: the CMS workspace at `/sites` and `/sites/[bindingID]`. Existing Studio routes, data ownership, authorization and public websites remain in place.

## Direction

User-approved: compact, calm workbench inspired by modern admin tools. Function and content lead. Use a directory for choosing websites, a compact site header with one module navigation, and list/detail editors. Avoid dashboard card walls, repeated navigation, oversized headings, repeated role explanations and developer terminology.

## Existing visual system

Retain Webdock's existing light/dark themes and orange brand accent. Consume inherited `--bg`, `--panel`, `--ink`, `--muted`, `--line`, `--soft`, `--accent`, `--success`, `--success-bg`, `--error`. Do not introduce unrelated brand colors. Keep the locally loaded Space Grotesk for headings and existing system sans for body; small regular interface headings, no display-sized titles.

4px spacing rhythm: 4, 8, 12, 16, 24, 32. Fields at least 36px high on desktop, touch actions at least 44px where needed. Borders encode grouping; no decorative gradients or shadows. 24px page titles, 16px section headings, 13–14px body labels. Brand accent is restrained to focus and active navigation.

## Workspace structure

- Website directory: search, role labels in human language, compact rows with site name, domain and one primary CMS action. Legacy sites retain their existing working destination.
- Site header: one short site name, domain, role and website link. One area navigation. Child pages use only the current area's name as heading.
- Overview: direct task links with useful short descriptions; component inventory stays secondary. Do not display implementation names as primary interface copy.
- Content: variant switch, search and text/image filters, field list with current content, focused editor and real image preview. Preserve unsaved drafts when switching fields; warn before losing them on navigation. Current CMS saves directly; do not label this as a draft publication workflow.
- Calendar: compact weekly rows, clear opening/closed states, date exceptions, scannable bookings and deliberate add-entry form.
- Shop: scan products before editing, search within loaded page, reveal fields on demand. Keep media selection, featured products and customer profile controls. No duplicate module nav.
- Requests: readable status and compact scan/detail flow.

## Interaction and accessibility

Primary actions describe the action. Show idle, changed, saving, saved and error states near the editor. No decorative toasts. Keep version conflicts actionable and data intact. Preserve native labels, keyboard focus, visible focus rings and disabled/pending controls. Role gating remains server-side. Mobile widths 320/375/414/768 must have no page-level horizontal overflow; stack list/detail layouts and preserve navigation access. Do not hide errors behind collapsed sections. Motion is unnecessary beyond native feedback; respect reduced motion.

## Free canvas and live preview

Delivered in the Design module: typed text, image, box and button elements with stable IDs, free positioning/resizing, layers, undo/redo and independent desktop/tablet/mobile frames. Unsaved edits feed a sandboxed live preview using the same renderer as published pages. Draft saving, publishing and explicit homepage activation are separate actions; optimistic revisions preserve conflicting drafts. Existing imported content remains in the Content module. Original websites remain available and homepage activation is reversible.

## Customer view

Superadmins can enter a visibly marked, read-only tenant-admin view for one customer. It retains the real operator identity, expires after 15 minutes, and audits entry, exit and denied operations. Tenant boundaries and write denial are enforced server-side. Expiration stays restrictive until explicit exit. This inspects customer permissions without creating a customer login or acting under a forged identity.

## Interface language

English source messages and German GNU gettext catalogs cover Studio, Auth, Webdock marketing and the reusable CMS UI. System follows the browser language; English and German can be selected explicitly. Language changes preserve editor identity, unsaved values, revisions and signed login URLs. Customer content and the content locale are separate from interface language.
