# Release checklist

Use this checklist before promoting `staging` to `main`.

## Automated checks

- [ ] Dependencies install cleanly with `npm ci`.
- [ ] Typecheck passes with `npm run typecheck --if-present`.
- [ ] Lint passes with `npm run lint --if-present`, if configured.
- [ ] Tests pass with `npm run test --if-present`, if configured.
- [ ] Production build passes with `npm run build`.

## Manual smoke test

- [ ] App starts without a startup error.
- [ ] Main UI opens.
- [ ] Browser console has no critical errors.
- [ ] A new project or configuration can be created.
- [ ] A basic module can be inserted.
- [ ] Module parameters can be changed.
- [ ] Price/BOM calculation opens and does not crash.
- [ ] Project save works.
- [ ] Project load works.
- [ ] Export or render works, if available in the app.
- [ ] The tested change did not break an existing workflow.

## Release decision

- [ ] Known issues are documented.
- [ ] Rollback path is clear.
- [ ] Manual QA was confirmed on `staging`.
- [ ] `staging` is ready to merge into `main`.
