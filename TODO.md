# Webdock TODO

- [ ] **Direct SSO entry for every Payload admin.** Unauthenticated `/admin` requests should go straight through the central Webdock login and return to the intended admin page. Do not show the Payload login form. Fully disable local Payload email/password login, password recovery and native JWT authentication. Finish identity mappings and operator MFA/customer onboarding before the per-site cutover so existing users are not locked out. Central Better Auth sign-in remains the identity entry point.
- [ ] **Create a dedicated Webdock favicon.** Derive a recognizable small mark from the Webdock branding, provide suitable SVG/ICO assets, and check readability at 16/32 pixels in light and dark browser themes.
- [ ] **Plausible tracking module for Webdock, Spitzli and Stall.** Add per-site enablement and validated Plausible script configuration.
- [ ] **Dependency maintenance.** Review the remaining transitive audit findings in the pinned Payload/build-tool dependency trees (including braces/chokidar/micromatch/sass and esbuild/drizzle-kit). Do not use an indiscriminate major-version audit fix during the auth cutover.
