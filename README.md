# MoveGap

Money-track prototype for Business Cup 2.0. Compare entered housing and moving offers against a 60-day cash timeline.

## Current status

Working MVP with four independently accessible sections: Overview, Move details, Compare options and Payment tracker. Includes creating and editing offers and payments, real cash-flow comparisons, a selected payment plan, actual amounts, validated browser persistence and an explicit demo Move Pass. No payments are collected. Example data is fictional and runs through the real engine. No bank or legal integrations. The pitch and final submission remain separate deliverables.

Production: https://movegap.vercel.app. Local changes appear there only after publication.

Overview shows the selected plan or a clearly labelled preview of the first entered option. Navigation is not a wizard: all sections are accessible at any time, and switching sections keeps the same in-memory inputs. Use Save plan to retain a valid selected plan after reloading. The original `#/move`, `#/compare` and `#/plan` links remain supported; `#/overview` opens the summary.

## Run

Requires Node.js 22.12+ (24 recommended) and pnpm 11.25.0. If pnpm is missing and npm is available, run `npm install -g pnpm@11.25.0` once.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
```

On Windows PowerShell use `pnpm.cmd` if PowerShell blocks the command shim. The local development URL is printed by Vite. `pnpm preview` serves the production build. A static `dist/` deployment supports local-only plans. The optional cloud API requires Vercel Functions and PostgreSQL; `pnpm dev` and `pnpm preview` alone do not serve API routes.

## Cloud API

The server implements [cloud contract v1](src/contracts/cloudPlan.ts) independently of the UI. The client transport and private-link panel are separate integration work; adding this server does not automatically add cloud controls to the current interface.

- `POST /api/cloud-plans`: create a complete valid plan (201).
- `GET`, `PUT`, `DELETE /api/cloud-plans/:planId`: restore, update and remove (200).
- `POST /api/cloud-plans/:planId/rotate-key`: revoke the previous key (200).

All operations use `Authorization: Bearer <secret>` with 32 cryptographically random bytes encoded as 64 lowercase hex characters. The client generates and durably saves its key and UUID request ID before sending a mutation. Rotation additionally supplies `X-MoveGap-New-Key`. Never put credentials in query strings, plan documents or logs. A future client restore link uses the contract's URL fragment, which is not transmitted in HTTP requests. Anyone holding the private link has full access; there are no accounts or email recovery.

Mutations require `requestId`; update/delete/rotation also require `expectedRevision`. Reuse the exact same request and key after an uncertain network result. Transactions prevent concurrent writers from silently overwriting each other. Exact retries retain their original response for 24 hours; a revision conflict returns 409 with `currentRevision`. Fetch the latest separately and preserve unsaved local edits. Revoked keys cannot retrieve financial data from old receipts.

Copy `.env.example` to ignored `.env.local`, configure server-only `DATABASE_URL` (Neon pooled connection with TLS), `CLOUD_RATE_LIMIT_SECRET` and `CRON_SECRET` (each independently generated with at least 32 random bytes). Do not prefix them with `VITE_`. Apply the idempotent migration with `pnpm db:migrate` before deploying. Set the same server variables in the appropriate Vercel environment. For integrated local API work use `vercel dev` after linking the project; Vite alone remains available for UI work without database access. Avoid sharing production credentials with unrelated preview branches.

The API validates JSON, dates, integer cents, references and actual-payment relationships, limits bodies to 256 KiB, and sets `Cache-Control: no-store`. Shared database quotas allow 120 requests/minute and 10 creation attempts/hour per HMAC-hashed client address, plus 500 creation attempts/day globally. Quotas apply to retries and invalid requests too; clients must respect 429 and `Retry-After`. These are application limits, not a substitute for platform traffic protection.

Plans expire 90 days after creation or successful update; reads and key rotation do not extend this. A daily authenticated Vercel cron at `/api/cloud-cleanup` physically removes expired plans and receipts. Deletion immediately removes the active financial document and earlier financial replay receipts. A metadata-only deletion receipt lasts up to 24 hours. Non-reversible used-key hashes remain to prevent reuse; provider backups follow the provider's retention policy. Data is encrypted in transit, not end-to-end encrypted: the application server and database operator can access plan content.

`pnpm test` runs the server suite against embedded PostgreSQL without cloud credentials. `pnpm test:cloud-live` repeats it on `DATABASE_URL` using isolated randomly named test schemas and removes those schemas on completion. It never resets application tables. Live tests may leave a test schema if the process is forcibly terminated. Run `pnpm build` for the frontend and server type checks. Never publish `.env.local` or access-bearing links in issues, screenshots or CI artifacts.

## Source structure

The four views live in `src/pages/`: overview, input, comparison and the selected plan. Team responsibilities follow functional blocks, not a mandatory page sequence. Shared components live in `src/components/`, browser persistence in `src/state/`, and calculation logic in `src/domain/`.

Shared contract: [types](src/domain/types.ts), [engine](src/domain/engine.ts), [fictional inputs](src/domain/example.ts).

## Calculation assumptions

Amounts are positive integer USD cents. Event kind determines sign. Dates are calendar dates interpreted in UTC for ordering, not local timestamps. All comparisons use the same 60-day window. On a shared date expenses precede income. Opening cash is available before events on the opening date; earlier events are assumed reflected in it.

Expected old-deposit refunds are excluded until an actual amount/date is entered. Proposed income is excluded. Proposed expense agreements remain explicitly conditional and cannot become confirmed recommendations. Actual payments replace their planned counterparts once. Refundable deposits reduce cash but are excluded from nonrefundable cost. Only entered events are included; the app does not infer rent proration, missing recurring bills or legal deadlines. Outside-window events produce warnings.

`calculatePlans(input)` returns input errors, valid plans, rejected combinations and recommendation IDs. Compare gaps to zero and to reserve separately. The earliest recommendation means earliest **among entered compatible confirmed options** that preserve the reserve. It does not search the rental market or guarantee future cash.

No license has been selected yet. Public visibility supports jury review; it does not imply a particular open-source license.
