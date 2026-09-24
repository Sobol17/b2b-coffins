# C2 CRM Catalog and Prices Implementation Plan

> **For agentic workers:** Implement the tasks in order with red, green, refactor cycles. This plan is executed in the current session.

**Goal:** An owner or manager fills and publishes the catalog from an empty CRM; only the owner receives cost prices.

**Architecture:** CRM form actions call services that validate references and use repositories for Drizzle writes. Existing portal catalog reads the same tables. Role-specific DTO builders omit cost fields before the response is formed. Price and discount management uses the existing schema and pricing resolver.

**Tech Stack:** SvelteKit 2, Svelte 5, Zod 4, Drizzle SQLite, Vitest, Playwright.

**Spec:** `tech.md` v1.38, §§5.4–5.5, 8, 12, 14 C2.

## Global Constraints

- Use `catalog.manage` for owner and manager writes; only `owner` may read or change `costPriceMinor`.
- Build CRM screens from `lib/ui`; all forms and query values use Zod on the server.
- Audit each mutation in its transaction; soft delete products and variants, disable options.
- Preserve portal visibility and personal price rules; cost never reaches a non-owner response.
- Keep source files at most 250 lines and functions at most 40 lines.

## Review Focus

- A forged cost form field from a manager must return 403 and leave cost unchanged.
- Hiding or deleting a model or variant must remove it from the portal and public cover endpoint.
- Invalid category, material, stock item or option references must fail before a write.
- Overlapping base price windows must fail even when one end is open.
- A failed media upload must not create a visible media row.

## Tasks

### Task 1: Contract and validation

**Files:** `tech.md`, `src/lib/types/crm-catalog.ts`, `src/lib/validation/crm-catalog.ts`, `tests/unit/crm-catalog-validation.spec.ts`.

- [ ] Write tests for money, ids, dates, default option uniqueness and forged cost input.
- [ ] Run the test and confirm the relevant assertions fail.
- [ ] Add the exact DTOs from §8 and Zod schemas for every C2 form.
- [ ] Run the test and typecheck; commit.

### Task 2: Categories, models, variants, options and matrix

**Files:** `src/lib/server/crm-catalog/*`, `tests/unit/crm-catalog.spec.ts`.

- [ ] Test creation without seed, reference validation, visibility, soft deletion, matrix defaults, audit and role checks.
- [ ] Confirm failures, then add repositories, DTO mapping and services.
- [ ] Run focused tests and typecheck; commit.

### Task 3: Media

**Files:** `src/lib/server/crm-catalog/*`, `src/routes/api/files/+server.ts`, `src/lib/validation/files.ts`, `tests/unit/crm-media.spec.ts`.

- [ ] Test signature and MIME validation, owner checks, cover/order mutation, and invisible failed uploads.
- [ ] Confirm failures, then add media storage and form/API actions.
- [ ] Run focused tests and typecheck; commit.

### Task 4: Price lists and discounts

**Files:** `src/lib/server/crm-pricing/*`, `src/lib/domain/request/pricing.ts`, `src/lib/server/request/draft-calculator.ts`, `tests/domain/pricing.spec.ts`, `tests/unit/crm-pricing.spec.ts`.

- [ ] Test active windows, base overlaps, item CRUD, category rule matching and the max-discount calculation.
- [ ] Confirm failures, then implement services and wire the request calculator.
- [ ] Run focused tests and typecheck; commit.

### Task 5: CRM screens

**Files:** `src/routes/(crm)/crm/catalog/**`, `src/routes/(crm)/crm/prices/**`, `src/lib/crm/catalog/**`, `src/routes/(crm)/+layout.*`.

- [ ] Add an e2e flow for creating and publishing a model from a fresh category, and 403 for a portal role.
- [ ] Confirm the e2e fails, then add the screens and form actions.
- [ ] Run focused e2e and typecheck; commit.

### Task 6: Full gate and review

- [ ] Run `pnpm lint`, `pnpm check`, `pnpm test:unit`, `pnpm test:e2e`, `pnpm build`.
- [ ] Review every C2 requirement against the diff and verify the response body lacks cost outside owner.
- [ ] Commit any repair as a focused change. Leave one C2 branch for PR.
