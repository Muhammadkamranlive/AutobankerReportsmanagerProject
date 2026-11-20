# Enterprise Delivery Status

As of 2026-10-28. Current development slice, not production certification or a
claim that all requirements are complete. Authoritative direction: build OUR OWN
scalable enterprise report engine/UI. Keep existing packages, including QuestPDF
and Fabric.js; no FastReport code/package, adapter or designer integration.
FastReport is a competitive capability benchmark only, with no mandatory vendor
procurement. We own our code, not dependency code; applicable licenses remain.

Traceability: [system requirements](reporting-system-requirements.md) and
[UI requirements](reporting-web-ui-requirements.md). Existing IDs, including
ENG-03, ENG-06, AT-14 and UI-27, remain stable and now describe our own engine.

## Implemented Development Slice

| Area | Delivered scope and boundaries |
| --- | --- |
| Query engine | ReportQueryEngine accepts posted JSON: <=8 sources, <=10,000 total rows; qualified nested scalar fields; ordered single-key INNER/LEFT joins, NULL never matches, <=10,000 intermediate output; AND eq/ne/gt/gte/lt/lte/contains/isNull/notNull filters; field/alias select; groupBy and sum/count/average/min/max decimal aggregates; stable multi-column sorting. Not full SQL: no ON predicates or OR/HAVING. |
| APIs | POST /api/reports/query, /api/reports/export/csv, /api/reports/export/xlsx and /api/reports/query/pdf; 6 MB request ceiling. Not a source credential or SQL execution service. |
| Exports | TabularReportExporter uses native .NET CSV/XLSX with no new dependencies. PdfRenderService.RenderDataset provides flowing PDF, repeated headers and page count, <=12 columns. Legacy canvas tables remain fixed-height. |
| Visual collections | Data button -> sample/upload JSON -> configure -> Run -> Apply/export. Nested scalar discovery; <=5 MB upload, 8 sources, 10,000 total source rows, 128 fields. Joins, fields/aliases/aggregates, filters, group/sort, <=100-row display, full bounded <=10,000-row Apply; CSV/XLSX/PDF and query JSON save/load; edits clear stale results; request cancellation. |
| Binding | Apply binds selected/new report table to ReportRows. previewPdf passes reportData. Runtime data is not embedded/persisted in template JSON; query save/load is not durable snapshot persistence. |
| Precision | API typed numeric computation uses .NET decimal. Browser JS numbers may lose precision before a request or after result parsing. Exact arbitrary-decimal round trips are not guaranteed; lossless transport, currency, rounding and FX policy remain work. |

## Verification Evidence

- 98 frontend tests passing in the current development slice. Root `npm test`
  currently runs frontend tests only; `npm run build` is the build command.
- Backend executable query/export checks:
  `dotnet run --project tests/ExportChecks/ExportChecks.csproj`.
- With the backend running: `node tests/report-api-checks.mjs` covers live API
  responses/errors and a 1,000-row flowing PDF verified as 33 pages.
- These results do not prove all rows/totals/layouts under every workload, complete
  cross-format fidelity, security isolation, production scalability or the full
  AT-01 through AT-15 acceptance suite.

## Production Blockers

Authentication, tenant isolation, source credential management, durable server
persistence, snapshots, jobs and audit are not built. Do not expose this slice
to live banking data. No SQL connectors/live bank data, stored procedures/views,
registered LINQ providers, subreports, layout bands, charts, pivots or scheduling
are implemented. Development bounds are not enterprise throughput guarantees.

## Capability and Acceptance Backlog

Each row defines observable acceptance for an agreed representative report pack.
All rows remain open; partial features above are not closure of these gates.
Priorities and requirement IDs in the companion documents continue to apply.
No universal competitor-parity claim, invented credentials, budget or delivery
date is implied. Agree workload and numerical tolerances before sign-off.

| Group / trace | Remaining capability | Observable acceptance before closure |
| --- | --- | --- |
| Governed sources and visual queries: DATA-01 through DATA-12; QUERY-01 through QUERY-10; UI-07 through UI-19 | Approved SQL tables/views/read-only procedures, registered LINQ providers, typed parameters; multi-key joins, ON versus WHERE, OR/HAVING and safe expressions; collection relations | Against approved test databases, compare joins/projections/totals to reference queries, retain unmatched LEFT rows, reject unauthorized objects and executable text, detect schema drift, enforce row/time limits and verify cancellation. No credentials in metadata/errors. |
| Banking dates and parameters: MGMT-04; LAYOUT-12 | As-of date, business versus posting/value dates, timezone, cutoffs, holiday calendars and late adjustments | Fixed fixtures at cutoff, midnight, DST and holiday boundaries select the approved rows for explicit as-of/business dates; parameter validation rejects ambiguous dates and records the calendar/timezone versions used. |
| Snapshots and reproducibility: DATA-13; EXPORT-03; UI-32; AT-10 | Durable authorized snapshots, pinned report/schema/query/parameter versions and reproducible exports | Change source data after a run: re-export retained snapshot with equal row counts/business totals; refresh creates a new run. Restore a snapshot and versions, verify checksums, freshness and retention/revocation behavior without cross-tenant access. |
| Decimal, currency and FX: DATA-09; LAYOUT-12; AT-08 | Lossless browser/API transport within an explicit precision/scale contract, currency metadata, rounding stages and versioned FX rates | Round-trip boundary fixtures including values beyond JS safe integer precision and fractional amounts without unapproved coercion; reject overflow/scale violations; compare totals to approved decimal reference vectors and reproduce conversions using pinned FX versions. Document XLSX numeric precision limits rather than promise arbitrary precision. |
| Reconciliation, controls and lineage: EXPORT-03; MGMT-08 | Source-to-projection lineage, control totals, running balances, exception handling and reconciliation | Representative bank fixtures reconcile opening + movements = closing under approved rules; deliberate missing/duplicate rows fail control checks; trace an output value to source, query and snapshot version without logging sensitive payloads. |
| Maker-checker and access: SEC-01 through SEC-04; MGMT-02/03/08; AT-11/12 | RBAC, maker-checker separation, row rules, masking, tenant isolation and audit | A maker cannot self-approve; disallowed roles cannot publish/export; direct API, preview, totals, caches and downloads honor identical row/masking rules. Cross-tenant/role negative tests and credential-redaction tests pass; revocation blocks subsequent artifact access. |
| Immutable approval and distribution: MGMT-02/07/08/09 | Immutable approved versions, approval evidence, authorized recipients, artifact checksums, retention and legal holds | Mutation of approved content is rejected; revisions require new approval; distribution verifies recipient access, records version/checksum and audit event, and prevents duplicate deliveries on retry. Expiry/revocation and legal-hold tests preserve the approved evidence. |
| Scaling, HA and quotas: EXPORT-02; SEC-05; NFR-01/02/03/05; AT-13 | Durable queues/workers, large async CSV/XLSX/PDF, quotas/backpressure, bounded memory, HA, backup/restore and observability | Record hardware, limits and timings for proposed 100,000-row XLSX/1,000,000-row CSV and concurrent jobs; meet agreed p95/memory ceilings. Kill/restart a worker and fail over storage/queue dependencies: recover without lost jobs or duplicate delivery; cancellation, quota rejection and restore drills are observable. These workloads exceed current JSON bounds. |
| Report packs, layout and interaction: ENG-03/06; LAYOUT-02 through LAYOUT-11; AT-06/07/14; UI-20 through UI-27 | Parameterized/versioned banking report packs, bands, nested collections, subreports, report books, drillthrough, charts and cross tabs/pivots | Save/reopen/migrate representative packs; verify empty children, subtotals/running balances, repeated headers and page totals. Reject dependency cycles; prove no N+1 child execution. Compare equivalent PDF/XLSX/CSV totals and drillthrough authorization, and reject unsupported output combinations explicitly. |
| Scheduled bursting: MGMT-05/06/07; UI-34/35; AT-13 | Business-calendar schedules, parameter profiles, recipient-specific partitions, retries and run history | Simulate DST, holiday, missed-run and retry cases; each authorized recipient receives only its partition exactly once under documented idempotency rules. Pause/cancel/revoke blocks future delivery and produces an auditable state transition. |
| Accessible UI and PDF: NFR-04; PDF-04; UI-39/40 | Keyboard/screen-reader authoring and viewer, tagged accessible PDF, separately assessed PDF/A/signing where required | Complete agreed keyboard and screen-reader workflows on desktop/mobile; check labels/focus/contrast. Validate tagged PDF reading order, table headings, language and alternative text with automated validation and assistive-technology review against the agreed accessibility target. Basic selectable PDF text is not acceptance. |

Sequence production delivery around identity/authorization, durable versions and
snapshots first; add governed sources and advanced layout behind their tests,
then enable scaled jobs, schedules and distribution only after recovery/load
gates. Existing JSON builder work can continue without claiming those gates pass.