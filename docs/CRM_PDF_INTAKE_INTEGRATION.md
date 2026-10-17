# PDF intake → client metrics: integration for ARC-012

The client CRM needs two facts from PDF intake (`docs/CRM_CLIENT_METRICS.md`): what each provider
call cost, attributed to the client and project, and what happened to each proposed object when a
person accepted a drawing. `develop` already has the tables (migration `0008_crm_client_metrics`)
and the helpers; ARC-012 (`feature/arc-012-pdf-intake-confidence-ladder`) only has to call them.
This was left to the ARC-012 owner on purpose: the branch was being changed while the CRM work was
done, and parallel edits would have collided.

## 1. Provider cost per call

Helper: `recordPdfIntakeUsage(createServerAiUsageRepository(), { clientId, projectId, userId, feature, usage })`
from `src/core/ai-usage/pdf-intake-usage.ts`. It takes the existing `usage` object
(`model`, `inputTokens`, `outputTokens`, `costUsd`, `costKind`, `cached`, `receiptId`), skips
cached answers and never throws.

Every place that does `store.updateMetadata(run => { run.usage.push(usage); })` should go through one
store method that pushes and records, e.g. `store.recordUsage(usage, feature)`:

| ARC-012 call site (as of `ea12b8da`) | feature |
|---|---|
| `server/pdf-intake/spacePipeline.ts` `onUsage` (line ~58) | `pdf_intake.vision` |
| `server/pdf-intake/spaceDimensionReview.ts` `onUsage` (lines ~61, ~138, ~150) | `pdf_intake.source_routing` |
| results of `server/pdf-intake/spaceDecisions.ts` (`usage` returned at ~138) | `pdf_intake.decision` |
| `server/pdf-intake/providers.ts` text decisions (`usage` at ~81) | `pdf_intake.decision` |

`clientId`/`projectId` come from the store's tenant path; `userId` is the person who started the run
(`ctx.userId` in `src/server/pdfSpaceEndpoint.ts`, passed into the pipeline options). The global
budget ledger stays as it is; it limits spending, the events attribute it.

## 2. Outcome per proposed object

Helper: `createServerPdfProposalOutcomeRepository().upsert(diffProposalOutcomes({...}))` from
`src/core/pdf-intake-metrics/pdf-proposal-outcomes.ts`. Pass what intake proposed
(`{ id, kind, source: "ai" | "rule" }`) and what the person accepted
(`{ id, kind, changedFields }`); the helper classifies accepted / corrected / rejected / added by
the user. A proposal is one object (room, wall, opening, furniture piece), not one field.

Call it where acceptance is written:

| ARC-012 call site (as of `ea12b8da`) | objects |
|---|---|
| `server/pdf-intake/spaceControlQuestionService.ts` `run.floorAcceptance = …` (lines ~108, ~220, ~269) | rooms, walls, openings of that floor |
| `server/pdf-intake/spaceControlQuestionService.ts` `run.furnitureAcceptance = …` (line ~118) | furniture pieces |
| `server/pdf-intake/spaceDimensionReview.ts` floor acceptance (line ~155) | rooms of that floor |

`changedFields` counts the active `CorrectionOperation`s on that object; `decidedByUserId` is the
person whose answer settled it (add `answeredByUserId` next to `answeredBy` in `answers.jsonl`).

## 3. Check

After wiring, the CRM export (`npm run crm:export -- --dry-run`) shows `pdf_documents_processed`,
`pdf_items_*` and `ai_cost_usd_pdf` for the client. Re-run the existing corpus (`corpusMetrics`) and
compare the corrected share with a manual check of three real drawings.
