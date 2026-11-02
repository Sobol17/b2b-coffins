## Change

Describe the problem, the resulting behavior, and the acceptance criteria.
Reference an existing task when applicable; no slice ID or plan is required.

## Contracts

List affected sections and the version of tech.md, or state that contracts
are unchanged. Explain schema, permission, event, and DTO changes when present.

## Validation

- [ ] Local gate: lint, check, unit, e2e, build
- [ ] Clean database: migrations, seed, production health smoke
- [ ] Self-review against tech.md §13.3–13.5

Record actual results and any skipped or blocked checks. For applicable changes,
include role isolation, price projection, audit, job retries and idempotency,
and migration checks on a copy of the development database.
