# Test Script Rules

Scope: `scripts/`.

- This folder owns regression and browser smoke scripts.
- Prefer extending existing scripts before adding a new test runner.
- Keep scripts deterministic and runnable against `http://127.0.0.1:5180/`.
- Do not require production secrets for local verification.
- Report concrete checks and console errors in JSON output when possible.
