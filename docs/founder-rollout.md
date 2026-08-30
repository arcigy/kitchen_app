# Founder rollout policy

Every new visible Arcigy capability must use a lowercase feature key and be guarded with `isFeatureEnabled(profile, userId, key)`. New keys are off by default in Main.

Release order is fixed:

1. Test the change on Develop.
2. Merge the tested code to Main with its feature key still off.
3. Enable the key only for `user_arcigy_owner` in the Arcigy tenant.
4. After founder verification, enable the same key for the intended client tenant/user.

Use `npm run db:set-feature-release -- --clientId <tenant> --userId <user> --feature <key> --mode enable` for a dry run. Add `--write` only after reviewing the result. Disable uses the same command with `--mode disable`.

Bug fixes that change behaviour must retain the prior path behind a feature key until founder verification; purely internal fixes still require the normal Develop and Main checks.
