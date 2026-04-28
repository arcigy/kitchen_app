# Git workflow

This repository uses a protected branch workflow so unstable refactors and fixes do not reach production by accident.

## Branches

### `main`

- Production branch.
- Must always represent the latest stable production-ready version.
- Do not commit directly to `main`.
- Production deploys should run only from `main`.

### `staging`

- Test branch for changes before production.
- Feature branches are merged here first.
- Manual QA and release checklist verification happen here.
- After staging is verified, `staging` is merged into `main`.

### `feature/*`

- Isolated branch for one fix, refactor, or feature.
- Keep each branch small and focused.
- Open Pull Requests from `feature/*` into `staging`.
- Do not merge directly from `feature/*` into `main`.

## Start a new fix

```bash
git checkout staging
git pull origin staging
git checkout -b feature/nazov-opravy
```

Make the change, then run the relevant checks:

```bash
npm run typecheck --if-present
npm run lint --if-present
npm run test --if-present
npm run build
```

Commit and push:

```bash
git add .
git commit -m "Fix: short description"
git push -u origin feature/nazov-opravy
```

Then open a Pull Request:

```text
feature/nazov-opravy -> staging
```

## Merge into staging

Before merging into `staging`:

- CI must pass.
- The change must be reviewed.
- The affected workflow must be manually tested.
- The release checklist should be updated if the workflow changed.

After merge:

```bash
git checkout staging
git pull origin staging
npm run build
```

Run manual QA using `docs/release-checklist.md`.

## Promote staging to production

Only after staging is verified:

```bash
git checkout main
git pull origin main
git merge --no-ff staging
npm run build
git push origin main
```

Production deploy should run from `main`.

## Never do this

- Do not commit directly to `main`.
- Do not force push shared branches.
- Do not delete branches unless the work is already merged and confirmed.
- Do not merge untested code into `main`.
- Do not commit `.env`, secrets, API keys, or private customer data.
- Do not mix large refactors with bug fixes in one branch.
- Do not bypass failing CI without writing down the reason.
- Do not deploy from `feature/*` to production.

## Deployment recommendation

Hosting is not configured in this repository yet.

Recommended mapping:

- Production deploy: `main`
- Staging deploy: `staging`
- Preview deploys: `feature/*`, if the hosting provider supports previews
