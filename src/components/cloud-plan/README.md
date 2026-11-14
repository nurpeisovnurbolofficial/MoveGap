# CloudPlanPanel handoff (A4)

Controlled UI for `CloudPlanPanelProps` in `src/contracts/cloudPlan.ts`.
Import `CloudPlanPanel` and pass the client's state and callbacks. Its CSS is
imported by the component. All props remain exactly as specified by the contract.
Nurbol owns App integration; Sasha owns the client, transport and local recovery.

This folder has no API, storage, clipboard implementation or financial formulas.
It must not be used to claim a successful server save without a real client.
`cloudPlanPanelExamples()` supplies explicitly fictional fixtures for tests.

## Callback responsibilities

- `onSave`: persist a specific validated snapshot; expose saving/saved/error state.
  The panel requests consent before the first online save.
- `onOpenLink`: validate a same-origin private link, capture its credential safely,
  preserve the current local draft, then load and replace only after success.
  The panel asks for confirmation but does not make the recovery copy itself.
- `onLoadServerVersion`: preserve local recovery before replacing data.
- `onSaveLocalAsNew`: preserve the existing server version and create a separate
  plan with a new credential and request ID. Conflict actions are never automatic.
- `onCopyLink` / `onRevealLink`: handle clipboard/retrieval only after user action.
  Set `copyStatus`; provide `privateLink` for explicit reveal or copy fallback.
  Never send a private link to logging, analytics, third-party tools or screenshots.
- `onRetry`: repeat the same pending request ID and payload, not a fresh mutation.
- `onDeleteCloudCopy` / `onRotateLink`: confirmation is already presented by this
  UI. Client must preserve local data, update metadata and clear stale credentials.

Publish pending operations and their results through controlled state (including
same-kind error results). Do not report saved while `hasUnsentChanges` is true.
Keep `lastSaved` on service failures. A 404 deliberately does not distinguish an
invalid key from a missing/deleted/expired plan. The component hides private-link
values by default and never renders a clickable private URL.

## Verification

Unit tests cover every supplied state, local/online separation, conflict actions,
unknown mutation outcomes, hidden credentials, and fixed error messages. Browser
checks covered 360/390/768/1440 px, explicit callbacks, confirmation/cancel/Escape,
focus return, copy fallback, load, delete and rotation using a labelled UI-only
fixture harness. No real database or two-browser cloud acceptance is claimed.

The temporary local harness is not shipped. Real acceptance still requires the
S4 client and N4 API, including lost responses, two-browser revision conflict,
invalid/expired links, deletion/rotation and recovery after service errors.
