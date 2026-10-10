# Customer view and free canvas

User requested delivery order: customer impersonation, then site builder and live preview. User explicitly selected free design canvas rather than predefined sections. Existing compact Webdock CMS design remains the visual system.

## 1. Customer view

Deliver a clearly named read-only tenant-admin preview because provisioned lead organizations may have no actual customer users. Do not manufacture customer accounts, change membership or issue customer identity tokens. The actual operator remains the authenticated actor. A central session-bound preview row scopes Studio to one active customer for 15 minutes. An expired context remains restrictive until explicitly exited. Ordinary users cannot start previews. Start, exit and expiry are auditable without tokens/form contents.

Studio session response adds optional `preview: { customerID: string; customerName: string; expiresAt: string; status: 'active' | 'expired'; readOnly: true; role: 'admin' }`. During preview `operator=false` and displayed user role is `user`; actual authentication and actor identity remain unchanged. Preview site rows retain display role `admin`; write capability is separately false. Only explicit tenant read operations are available, with exact customer ID validation. All browser-originated CMS writes and operator/native registry surfaces must enforce preview restrictions server-side. External legacy CMS launch does not claim to impersonate its operator session and is unavailable in preview. Exit returns to the operator's target customer page. Other sessions remain unchanged.

## 2. Free canvas

Create a typed versioned page document with text, image, box and button nodes, stable node IDs, layer order and independent desktop/tablet/mobile frames. Users can add, select, move, resize, reorder, duplicate and delete elements, change typography/colors/links, and use undo/redo. Pointer gestures and numeric inspector share the same document edits. Keyboard movement and non-drag controls remain available. No arbitrary JavaScript or HTML fields.

Payload stores separate draft and published documents with monotonic revisions and optimistic concurrency. Saving does not publish. Publishing is explicit and atomically promotes a saved revision. Existing imported HTML pages and Pizza storefront remain intact; newly authored canvas pages get explicit public URLs. The existing imported text fields are not falsely presented as a lossless editable canvas of the old layout. Shared package code is vendored into standalone instances through the established sync workflow.

## 3. Live preview

Use one validated deterministic renderer for editor preview and public output. The preview renders the current unsaved document, supports desktop/tablet/mobile modes and hides editing handles. Isolate rendered content from Studio credentials and scripts; do not put bridge secrets into HTML, postMessage or URLs. Public routes read only published documents; draft/preview values require current site access. Publish conflicts retain local work. Exact page routing and schema interfaces are recorded in the builder plan before implementation.

## Validation

Regression tests cover operator/MFA/session/tenant isolation, expired contexts, native/API mutation denial, schema/input bounds, renderer escaping, unsafe links, geometry constraints, undo grouping, draft/public isolation and revision conflicts. Build and browser tests include 320/375/414/768px, actual save/publish/preview flow, and customer preview enter/exit. Production rollout is additive and does not automatically replace any existing homepage.

## 4. Webdock localization (added user request)

After customer view, free canvas and live preview, localize the entire Webdock product interface with gettext catalogs. English is the source/default fallback; German is selected for German browser/system language. Provide explicit English/German/System preference. Keep customer-authored website content in its authored language. Shared terminology and catalogs cover Studio, Auth and the Webdock app; avoid mixed-language screens. Preserve current URLs and authorization behavior.

## Final action requested by the user

After all requested implementation, deployment and verification is complete, shut down the user's PC. This is explicitly authorized as the final action only. Do not shut down while tasks, migrations, deployments or required checks are still running. Never store the supplied sudo password in project files or reports. Verify the execution host is the user's PC before issuing shutdown, and leave completion/continuation evidence in the workspace first.
