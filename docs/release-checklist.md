# Release checklist

Use this checklist before promoting tested `develop` to `main`.

## Automated checks

- [ ] Dependencies install cleanly with `npm ci`.
- [ ] `npm run security:dependencies` passes with no production `high` or `critical` finding.
- [ ] Repository secret scan passes with `npm run security:secrets`; findings contain no secret values.
- [ ] Every GitHub Action uses a reviewed full commit SHA with a readable release-version comment.
- [ ] CodeQL JavaScript/TypeScript analysis completes and every blocking result is reviewed before release.
- [ ] CycloneDX production SBOM artifact exists for the exact release commit and parses successfully.
- [ ] GitHub secret scanning and push protection are enabled, and every real alert has provider-side revocation/rotation evidence before being resolved.
- [ ] Dependabot version updates monitor npm and GitHub Actions against `develop`; every generated PR passes `verify` and is reviewed before merge. Dependabot alerts/security updates are enabled separately when approved.
- [ ] GitHub dependency graph is enabled and the PR-only dependency review gate rejects newly introduced `high` or `critical` vulnerabilities in runtime, development, and unknown scopes.
- [ ] Typecheck passes with `npm run typecheck --if-present`.
- [ ] Lint passes with `npm run lint --if-present`, if configured.
- [ ] Tests pass with `npm run test --if-present`, if configured.
- [ ] Production build passes with `npm run build`.
- [ ] The GitHub `verify` job proves `/ready` reports isolated file storage and the complete `npm run test:ui-regression` chain passes, including accessibility, project save/load, versions, FQP roundtrip, and zero browser console errors.
- [ ] If the CI UI gate fails, its synthetic runtime log is reviewed and no check is skipped or retried away.
- [ ] Deployment `/health` and `/ready` smoke succeeds.
- [ ] A production-startup negative check proves file/implicit storage and cross-wired namespaces fail before repository creation or port binding, while the selected explicit PostgreSQL namespace starts normally.
- [ ] The CapRover preflight proves the existing target has the expected environment/schema/object prefix, PostgreSQL mode, one replica, and a writable persistent `/app/storage` mount; missing apps are never created implicitly.
- [ ] Metrics scrape succeeds with the protected production token and has no tenant/project labels.
- [ ] An approved request-budget smoke returns 429 with `Retry-After` only after the configured test threshold and does not affect another tenant.
- [ ] A test mutation produces one `mutation_audit` event correlated by request ID and contains no raw tenant, user, project, session, token, query, or payload data.
- [ ] A fresh login creates a server session, logout revokes the original cookie, the original cookie then receives 401 from both `/api/auth/session` and a protected project endpoint, and no session ID appears in JSON/logs.
- [ ] Exact create/save/import/restore retries with the same idempotency key return the same project/save; changed payload or stale save revision returns 409; another tenant cannot replay the receipt.

## Manual smoke test

- [ ] App starts without a startup error.
- [ ] Main UI opens.
- [ ] Browser console has no critical errors.
- [ ] Keyboard-only navigation reaches login, Project Manager, and core editor controls with a visible focus indicator.
- [ ] A screen reader announces the page language, main landmark, form labels, project controls, dialogs, and 3D viewer meaningfully.
- [ ] Text and controls remain usable at 200% browser zoom, and foreground/background contrast is manually accepted.
- [ ] A new project or configuration can be created.
- [ ] A basic module can be inserted.
- [ ] Module parameters can be changed.
- [ ] Price/BOM calculation opens and does not crash.
- [ ] Project save works.
- [ ] Project load works.
- [ ] Export or render works, if available in the app.
- [ ] The tested change did not break an existing workflow.

## Release decision

- [ ] Live `main` and `develop` protection/rulesets require pull requests and the `verify` status check, enforce administrators, and block force pushes/deletion.
- [ ] Known issues are documented.
- [ ] Historical Google API key alerts 1–3 are provider-revoked and resolved as `revoked`; no release relies on those values.
- [ ] Rollback path is clear.
- [ ] Database migration, durable storage, backup/restore, and disk headroom are compatible with the release.
- [ ] SLO impact and current error-budget state permit the release.
- [ ] Manual QA was confirmed on online `develop`.
- [ ] `develop` is ready to promote through a release PR into `main`.
