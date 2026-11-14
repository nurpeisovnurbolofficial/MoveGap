# MoveGap

Money-track prototype for Business Cup 2.0. Compare entered housing and moving offers against a 60-day cash timeline.

## Current status

Three-page working scaffold, **not a submission-ready product**. Includes editable payments and option dates, real cash-flow comparisons, a selected payment plan, actual amounts, validated browser persistence and an explicit demo Move Pass. No payments are collected. Example data is fictional and runs through the real engine. No bank or legal integrations. Public production hosting and the pitch remain separate deliverables.

## Run

Requires Node.js 22.12+ (24 recommended) and pnpm 11.25.0. If pnpm is missing and npm is available, run `npm install -g pnpm@11.25.0` once.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
```

On Windows PowerShell use `pnpm.cmd` if PowerShell blocks the command shim. The local development URL is printed by Vite. `pnpm preview` serves the production build. Deploy `dist/` to a static host; no secret environment variables are needed.

## Source structure

The three pages live in `src/pages/`: input, comparison and the selected plan. Shared components live in `src/components/`, browser persistence in `src/state/`, and calculation logic in `src/domain/`.

Shared contract: [types](src/domain/types.ts), [engine](src/domain/engine.ts), [fictional inputs](src/domain/example.ts).

## Calculation assumptions

Amounts are positive integer USD cents. Event kind determines sign. Dates are calendar dates interpreted in UTC for ordering, not local timestamps. All comparisons use the same 60-day window. On a shared date expenses precede income. Opening cash is available before events on the opening date; earlier events are assumed reflected in it.

Expected old-deposit refunds are excluded until an actual amount/date is entered. Proposed income is excluded. Proposed expense agreements remain explicitly conditional and cannot become confirmed recommendations. Actual payments replace their planned counterparts once. Refundable deposits reduce cash but are excluded from nonrefundable cost. Only entered events are included; the app does not infer rent proration, missing recurring bills or legal deadlines. Outside-window events produce warnings.

`calculatePlans(input)` returns input errors, valid plans, rejected combinations and recommendation IDs. Compare gaps to zero and to reserve separately. The earliest recommendation means earliest **among entered compatible confirmed options** that preserve the reserve. It does not search the rental market or guarantee future cash.

No license has been selected yet. Public visibility supports jury review; it does not imply a particular open-source license.
