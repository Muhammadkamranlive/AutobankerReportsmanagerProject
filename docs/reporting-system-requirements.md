# Reporting System Requirements

Status: Requirements with a current development-slice inventory; not production-ready.
Research and repository review date: 2026-10-28.
Product: Autobanker Reports Manager.

## 1. Purpose and Scope

Extend the existing Angular designer and ASP.NET Core application into a secure,
multi-user reporting platform. PDF is the highest-priority output; native Excel
workbooks and CSV are mandatory. Users must be able to select approved data
sources, build queries visually, join tables, project fields, group records,
design master-detail reports, and manage reusable subreports.

Authoritative direction: build OUR OWN scalable enterprise report engine and UI.
Keep the packages already used, including QuestPDF and Fabric.js. FastReport is
a capability benchmark only; no FastReport code/package integration, adapter,
embedded designer or second-engine dependency is planned. The company owns its
application code, not its dependencies; applicable third-party license obligations remain.

The posted-JSON query engine, visual builder and tabular exports are implemented
as a bounded development slice, not governed database access or a production platform.
See the companion [web UI requirements](reporting-web-ui-requirements.md).
See [enterprise delivery status](enterprise-delivery-status.md) for evidence and
banking-specific acceptance gates. Requirement IDs remain stable as scope evolves.

Priority meanings:

- P0: required for a safe first production release.
- P1: required for the complete reporting workflow after the foundation.
- P2: advanced capability, delivered after the core workflow.

## 2. Current State: What We Have and What Is Left

Statuses describe inspected code, not verified production readiness. A configured
feature is not proof of correct output for every template or large dataset.

| Area | Existing implementation | Remaining work | Evidence |
| --- | --- | --- | --- |
| Web designer | Angular, Fabric.js canvas, object properties, move/resize/rotate, undo/redo, layers, lock/hide, duplicate | Managed routes, shared library, advanced bands and data tools | [Designer](../frontend/src/app/app.ts), [store](../frontend/src/app/designer.store.ts) |
| Report objects | Text, rectangle, ellipse, line, image, QR, barcode, table | Charts, matrix/pivot, reusable blocks, subreports | [Types](../frontend/src/app/types.ts), [models](../backend/Models/TemplateModels.cs) |
| Page setup | Canvas settings plus separate flowing dataset PDF with repeated headers/page count, <=12 columns | Legacy canvas tables remain fixed-height; group page breaks and advanced layout validation remain | [Factory](../frontend/src/app/object-factory.ts), [renderer](../backend/Services/PdfRenderService.cs) |
| Starter designs | Banking and document starter template gallery | Shared ownership, versions, approval and deployment | [Library](../frontend/src/app/starterTemplates/library.ts) |
| Template storage | Browser localStorage, JSON import/export; backend template files | Server database, optimistic concurrency, version history and authorization | [Designer](../frontend/src/app/app.ts), [controller](../backend/Controllers/PdfController.cs) |
| PDF | QuestPDF canvas renderer plus RenderDataset flowing PDF; 1,000 rows live verified as 33 pages | Durable runs, advanced layout regression, production controls; dataset flow does not change canvas tables | [PDF API](../backend/Controllers/PdfController.cs), [renderer](../backend/Services/PdfRenderService.cs) |
| Excel / CSV | Native .NET TabularReportExporter, endpoints and builder downloads; no new dependencies | Enterprise export options, large async exports and compatibility sign-off | [Exporter](../backend/Services/TabularReportExporter.cs), [reports API](../backend/Controllers/ReportsController.cs) |
| Data binding | Posted JSON, qualified nested scalar fields; builder binds result to ReportRows; previewPdf passes reportData | Data is not embedded/persisted in template; durable typed schemas, parameters, calculations and exact browser decimal transport remain | [Normalizer](../backend/Services/JsonDataNormalizer.cs), [builder](../frontend/src/app/report-data-builder.ts) |
| Database access | Hardcoded sample data or request-provided values | Connectors, tables/views/procedures, secret storage, metadata and query execution | [Sample data](../backend/Data/SampleData.cs), [API](../backend/Controllers/PdfController.cs) |
| Queries / projection | Bounded JSON engine and visual builder: ordered single-key INNER/LEFT joins, AND filters, field/alias projection, groupBy/decimal aggregates, stable multi-column sorting | No full SQL, ON predicates, OR/HAVING, connectors or provider registration | [Query engine](../backend/Services/ReportQueryEngine.cs), [builder](../frontend/src/app/report-data-builder.ts) |
| Grouping / collections | JSON collection selection, nested scalar discovery and flat grouped result aggregates | Nested array relations, presentation groups/bands, running balances and master-detail remain | [Query engine](../backend/Services/ReportQueryEngine.cs), [renderer](../backend/Services/PdfRenderService.cs) |
| Subreports | No subreport contract found | Versioned references, mappings, recursion guards and shared snapshots | [Models](../backend/Models/TemplateModels.cs) |
| Security / operations | Configured CORS and basic application setup | Authentication, permissions, tenant isolation, audit, jobs, schedules and retention | [Startup](../backend/Program.cs) |
| Tests | 98 frontend tests passing; backend executable query/export checks; live API errors and 33-page PDF checks | Connector, security, durability, load and advanced layout acceptance remain; root npm test is frontend-only | [Backend checks](../tests/ExportChecks/Program.cs), [live checks](../tests/report-api-checks.mjs) |

Important distinctions: canvas grouping is not data grouping; a bound table is
not a database table browser; JSON export is not Excel/CSV report export; page
number settings do not establish robust multi-page data-band behavior.

Current limits: API accepts posted JSON sources up to 8 and 10,000 total rows;
join intermediate output is capped at 10,000. NULL join keys never match. Filters
are AND-only: eq/ne/gt/gte/lt/lte/contains/isNull/notNull. Projection selects fields
with aliases; groupBy supports sum/count/average/min/max decimal aggregations.
Browser import is limited to 5 MB, 8 sources, 10,000 rows and 128 scalar fields.
The builder displays at most 100 result rows but applies the full bounded result
up to 10,000 rows, clears stale results on edits and offers request cancellation.
It saves/loads query JSON, not durable snapshots or a shared dataset catalog.

.NET decimal is used for typed numeric computation within the API. Browser JS
number parsing/serialization can lose precision; this is NOT an exact arbitrary
decimal money round-trip guarantee. Currency, FX, rounding and lossless transport
contracts are still acceptance work. Do not use live banking data: authentication,
tenant isolation, source credentials, durable persistence, snapshots/jobs/audit
are not built.

## 3. Competitive Research and Our Engine Decision

### 3.1 Competitive Reference Only

Official sources describe FastReport as a band-oriented .NET reporting engine
with group bands, master-detail layouts, subreports, tables, matrices, business
objects implementing IEnumerable, and database connectors. Commercial offerings
include web components and an online designer, depending on the purchased edition.

The open-source repository is MIT-licensed, but its Community Designer is not
covered by that MIT license. The documented built-in open-source export list is
HTML and images, with PDF available through a separate PdfSimple plugin. Do not
assume full PDF, XLSX, CSV, or Online Designer rights from the open-source package.

The commercial agreement describes restrictions concerning embedding and competing
products. These are competitive research observations, not a procurement gate:
we are not procuring or integrating FastReport. No vendor entitlement, price,
credentials or budget is assumed.

Some official documentation/comparison URLs could not be extracted during
research. Treat package-specific export support, designer entitlement, framework
support and platform behavior as unverified competitor details, not our delivery gates.

### 3.2 Independent Engine Strategy

| Option | Role | Decision condition |
| --- | --- | --- |
| Existing QuestPDF | PDF foundation for our engine, preserving JSON canvas templates and dataset flow | Keep regression coverage and comply with the applicable license |
| Our engine and Angular/Fabric UI | Own query planning, collections, layout, governance and orchestration | Deliver capability-specific tests, not a second engine or vendor designer |
| Native .NET XLSX/CSV export | Implemented tabular data export without new dependencies | Extend measured correctness, format compatibility and bounded resource use |
| FastReport | Competitive benchmark for independently defined capabilities only | No code, packages, adapter, designer integration or mandatory procurement |

ENG-01 (P0): Version our engine/template contracts and expose capability discovery,
supported exports, limits and platform requirements. A second engine is not assumed.

ENG-02 (P0): Evolve the PDF-only rendering boundary into an asynchronous export
contract accepting a published report version, authorized data snapshot, format,
locale, timezone, cancellation token and export options. Return an artifact
reference/stream, content type, filename and warnings rather than always byte[].

ENG-03 (P0): Keep legacy JSON templates and QuestPDF rendering compatible as our
engine grows. Version our own flow/band contracts separately where necessary;
require explicit migration diagnostics and regression tests, not silent or
lossless-conversion claims. Do not introduce FastReport templates or integration.

ENG-04 (P0): Unsupported engine/format/object combinations fail validation before
execution. Never silently remove elements or switch engines after publication.

ENG-05 (P0): Evaluate the actual target OS/container, pinned package versions,
fonts, native dependencies and supported .NET runtime. Retain the current .NET 8
baseline only while supported; plan a separately approved supported-LTS upgrade.

ENG-06 (P1): Prove our own grouped master-detail report with parameterized subreport,
long tables, logo, Unicode, page totals, PDF, XLSX and CSV. Record package versions,
applicable licenses, output differences, runtime, memory and deployment image.
The current flat dataset export slice does not satisfy this acceptance gate.

## 4. Data Sources and Dataset Requirements

| ID | Priority | Requirement and acceptance condition |
| --- | --- | --- |
| DATA-01 | P0 | Maintain reusable, authorized data-source definitions with provider, environment, owner, secret reference, timeout and status. Test connections without returning credentials. |
| DATA-02 | P0 | Deliver SQL Server first, including table/view discovery and typed parameterized commands; PostgreSQL next. Other providers require separate adapter tests, not generic compatibility claims. |
| DATA-03 | P0 | Expose only approved schemas/tables/views/columns. Preserve types, nullability, primary/foreign keys and decimal precision in metadata. Permission-check discovery and execution independently. |
| DATA-04 | P0 | Execute allowlisted stored procedures with typed input parameters, defaults and required flags. Map result sets to explicitly named datasets. Procedures with side effects are prohibited; read-only login alone is not proof of procedure safety. |
| DATA-05 | P0 | Support table/view selection and approved parameterized SELECT queries. Validate identifiers against metadata; bind values through provider parameters. No SQL string concatenation for user values. |
| DATA-06 | P0 | Register application-owned LINQ providers by stable ID. Approved C# code performs IQueryable/EF Core queries and DTO projections; the UI selects provider and typed parameters. No arbitrary C# or LINQ text compilation from browser input. |
| DATA-07 | P1 | Add authenticated HTTP/JSON sources with schema mapping, pagination, retries and quotas. Prevent SSRF with approved hosts, private-network policy, DNS checks and controlled egress. |
| DATA-08 | P1 | Accept JSON, CSV and XLSX uploads with size/row limits, explicit types, delimiter/sheet selection, culture and validation errors. Reject macros, external links and executable content; do not evaluate formulas. |
| DATA-09 | P0 | Produce named typed datasets containing fields, rows, relations, provenance and validation warnings. Preserve nulls, booleans, dates, decimal money and identifier strings without accidental coercion. Define lossless decimal transport and currency/rounding rules; current .NET decimal computation does not prevent browser JS precision loss. |
| DATA-10 | P1 | Support nested paths and collections such as Customer.Address.City and Accounts[].Transactions[]. Define missing vs null vs empty behavior and relation cardinality. |
| DATA-11 | P0 | Use small, clearly labeled previews (default maximum 100 rows), cancellation and timeouts. Enforce server-side limits; production data is masked by default for designers. |
| DATA-12 | P0 | Version dataset schemas and detect removed/renamed/type-changed fields. Block publication on broken required bindings and show affected reports. |
| DATA-13 | P1 | Support compatible multi-dataset snapshots and cached results with freshness labels. Cache keys include tenant, permissions, report version and parameter hash. Never share results across security boundaries. |

Stored procedure output parameters and return codes are execution metadata, not
automatically report rows. Unknown/dynamic result schemas require an administrator
to approve a stable schema before designers bind fields.

## 5. Visual Query Builder, Joins and Projection

| ID | Priority | Requirement and acceptance condition |
| --- | --- | --- |
| QUERY-01 | P1 | Add approved tables/views to a relationship canvas with aliases and visible keys; drag fields to create joins and inspect generated read-only SQL. |
| QUERY-02 | P1 | Support INNER and LEFT joins initially, multiple join keys and self-joins. RIGHT/FULL joins are provider-gated P2 features; cross joins are disabled unless explicitly authorized. |
| QUERY-03 | P1 | Configure predicates in ON separately from WHERE so LEFT joins preserve unmatched rows correctly. Warn about incompatible types and many-to-many row multiplication. |
| QUERY-04 | P1 | Select, rename, reorder and exclude projected fields. Offer type-checked calculated fields, explicit casts, string/date/numeric operations and safe parameter references. |
| QUERY-05 | P1 | Add nested AND/OR filters, typed operators, inclusive/exclusive date ranges, null tests, multi-value parameters and stable multi-column sorting. |
| QUERY-06 | P1 | Define GROUP BY, HAVING, sum/count/min/max/average, distinct and computed aggregates. Reject invalid non-grouped projections. Define null and rounding behavior. |
| QUERY-07 | P0 | Persist a versioned query AST and compile it server-side through provider-specific structured APIs. Revalidate authorization and metadata on every execution; browser SQL is never authoritative. |
| QUERY-08 | P1 | Restrict advanced SQL editing to a separate permission and approval flow. Use parser/AST validation plus database least privilege, timeouts and resource limits; keyword blacklists alone are insufficient. |
| QUERY-09 | P1 | Joins initially operate within one approved connection. Cross-database/source joins are P2 with explicit materialization, cardinality and memory limits. Procedure results join only through an approved bounded materialization path. |
| QUERY-10 | P1 | Preview output schema/rows, warnings and generated parameterized SQL with values redacted. Save reusable datasets independently from report layout. |

Example workflow: add Customers and Accounts, LEFT join on CustomerId, select
customer name and account number, join Transactions, filter PostingDate with
StartDate/EndDate parameters, project Debit/Credit/Balance, group by customer,
and bind the result to a report detail band. Tests must catch duplicate totals
caused by join cardinality; the system must not silently apply DISTINCT as a fix.

Execution order is explicit: authorize -> resolve parameters -> query/filter/join
-> projection/aggregation -> typed dataset snapshot -> presentation grouping and
layout -> export. Presentation grouping must not accidentally aggregate an
already aggregated dataset twice.

## 6. Report Design, Grouping, Collections and Subreports

| ID | Priority | Requirement and acceptance condition |
| --- | --- | --- |
| LAYOUT-01 | P0 | Preserve current JSON editor behavior and printed page geometry. Document coordinate units, margins, clipping, orientation and font fallback. |
| LAYOUT-02 | P1 | Add report title/summary, page header/footer, detail, group header/footer and child bands to engines that support them. Absolute-positioned and flow/band layouts are distinct modes. |
| LAYOUT-03 | P1 | Bind tables/repeaters to datasets or nested collections, with typed columns, formatting, null display, alternating rows and empty-state behavior. |
| LAYOUT-04 | P1 | Support nested data groups with independent sort rules, subtotals, grand totals, running balances, reset scopes, keep-together and optional new-page boundaries. |
| LAYOUT-05 | P0 | PDF tables must continue across pages without losing or duplicating rows, repeat column headings, wrap text and avoid header/footer overlap. Oversized rows have an explicit split/overflow policy. |
| LAYOUT-06 | P1 | Support parent-child relations and master-detail-detail collections. Child filters inherit the authorized parent context; empty children do not crash or duplicate parents. |
| LAYOUT-07 | P1 | Support subreports by immutable report-version reference, typed parameter mapping, dataset relation, shared style and explicit no-data behavior. |
| LAYOUT-08 | P1 | Validate the subreport dependency graph; reject cycles and enforce configured nesting depth, page count, query count and execution budget. Batch child data to avoid N+1 queries. |
| LAYOUT-09 | P1 | Add safe expressions for display conditions, computed text, conditional formatting and locale-aware dates/currency. Do not run uploaded template scripts as trusted application code. |
| LAYOUT-10 | P2 | Add charts, pivot/matrix, reusable letterheads, template inheritance, linked styles, drill-through and report-book composition, each with declared export compatibility. |
| LAYOUT-11 | P1 | Distinguish visual object grouping from dataset grouping. Visual groups preserve child positions during move/resize and do not alter query results. |
| LAYOUT-12 | P1 | Add localization, RTL evaluation, timezone policy, currency precision and formatting. Resolve names/fonts consistently in browser preview and server PDF. |

## 7. Export Requirements: PDF First

All formats consume the same authorized versioned dataset snapshot. Users must
choose between layout-oriented output and data-oriented output; CSV is not a
pixel-perfect rendering of a page and an XLSX workbook is not a PDF screenshot.

| ID | Priority | Requirement and acceptance condition |
| --- | --- | --- |
| PDF-01 | P0 | Generate valid, downloadable application/pdf with selectable text, correct glyphs, explicit font provisioning and accurate images/barcodes. PDF remains the default export. |
| PDF-02 | P0 | Pass multi-page tests for long tables, nested groups, totals, repeated headers, page X of Y and subreport overflow when the selected engine supports those features. |
| PDF-03 | P0 | Preview is server-rendered using the same engine, version, parameters and snapshot as download. Show draft/preview watermark when policy requires it. |
| PDF-04 | P1 | Evaluate password protection, encryption, digital signatures, PDF/A and tagged PDF/PDF-UA separately. Enable only verified engine/version capabilities; these are not included in basic-PDF acceptance. |
| XLSX-01 | P0 | Produce real .xlsx with the Open XML workbook MIME type, not renamed HTML/CSV or embedded page images. Open successfully in Excel and LibreOffice. |
| XLSX-02 | P0 | Data mode exports the approved projection with real typed numeric/date cells, identifier strings preserving leading zeros, column headings, filters and frozen header row. |
| XLSX-03 | P1 | Support one sheet per named dataset, optional group outline/subtotals, number formats, column widths and print settings. Layout mode is separately capability-gated and documents merged-cell limitations. |
| XLSX-04 | P0 | Enforce worksheet limits (1,048,576 rows including headers, 16,384 columns); split sheets explicitly or reject with an actionable error. Neutralize formula injection in untrusted strings and prohibit external links/macros. |
| CSV-01 | P0 | Export one explicitly selected projected dataset with stable column order, configurable delimiter, UTF-8/BOM option, header option and documented null/date/decimal policy. |
| CSV-02 | P0 | Correctly quote delimiters, double quotes and line breaks. Offer spreadsheet-safe handling of formula-leading values; never silently change identifiers or monetary values. |
| CSV-03 | P1 | Multiple datasets require selection or a ZIP of separately named CSV files plus a manifest. Never interleave unrelated row schemas in one CSV file. |
| EXPORT-01 | P0 | Expose export capabilities and per-format options; validate before enqueueing. Use safe filenames and correct Content-Type/Content-Disposition headers. |
| EXPORT-02 | P0 | Long exports run as background jobs with progress, cancellation, bounded memory and authorized expiring downloads. Avoid holding every large result/PDF in API process memory. |
| EXPORT-03 | P0 | A run records report version, engine/version, schema version, parameter hash, snapshot/freshness, requester and output checksums. Re-export from the same retained snapshot preserves business totals. |

## 8. Report Management and Governance

| ID | Priority | Requirement and acceptance condition |
| --- | --- | --- |
| MGMT-01 | P0 | Provide a searchable report catalog with folders/tags, owners, engine, status and last published version. Persist templates, bindings and export profiles server-side. |
| MGMT-02 | P0 | Draft -> review -> published -> archived lifecycle; published versions are immutable. Optimistic concurrency prevents silent overwrites; rollback creates a new publish event. |
| MGMT-03 | P0 | Separate permissions for view, run, export, design, publish, schedule, data-source administration and advanced SQL. Enforce them server-side, including artifact access. |
| MGMT-04 | P0 | Store versioned parameters: string, integer, decimal, boolean, date/datetime, enum and multi-select, with validation, safe defaults, cascading lookups and sensitive-value redaction. |
| MGMT-05 | P1 | Schedule daily/weekly/monthly/calendar runs with timezone, DST policy, business calendar, retries, idempotency, disabled/expired state and missed-run handling. |
| MGMT-06 | P1 | Run history includes queued/running/succeeded/failed/cancelled/expired states, timing, row counts, safe diagnostics and authorized retry/download. |
| MGMT-07 | P1 | Deliver via authorized in-app downloads and approved object storage; email links by default. Attachment delivery requires explicit sensitive-data policy and recipient authorization. |
| MGMT-08 | P0 | Audit data-source edits, query changes, publication, runs, downloads, permission changes and deletion without logging secrets or raw sensitive datasets. |
| MGMT-09 | P1 | Configure retention, legal holds, secure artifact deletion, source freshness and revocation. Deleted/archived reports preserve required audit history. |
| MGMT-10 | P1 | Import/export deployment bundles with schema versions, dependency manifests and environment-specific source mapping; never embed live credentials. |

## 9. Proposed Architecture and Contracts

```text
Angular catalog / data builder / designer / viewer
                    |
       Authenticated ASP.NET Core APIs
                    |
 Report catalog + versions + parameter validation + authorization
                    |
 Dataset planner -> connector / procedure / approved LINQ provider
                    |
          Authorized typed dataset snapshot
                    |
     Durable job queue -> export orchestrator
                    |
 Our layout engine + QuestPDF renderer | native data XLSX/CSV exporters
                    |
       Artifact storage + audit + run history
```

Suggested boundaries, not existing implementations: IReportEngine,
IReportExporter, IDataSourceProvider, IDatasetExecutor, IReportRepository,
IArtifactStore and a background export worker. Introduce only the boundaries
needed by each implementation phase; do not move database logic into the canvas.

Proposed entities: Report, ReportVersion, DatasetDefinition, DatasetVersion,
DataSource, ParameterDefinition, SubreportReference, ExportProfile, ReportRun,
ReportArtifact, Schedule, PermissionGrant and AuditEvent. Tenant scope and owner
must be explicit where applicable. Secrets remain in an external secret store.

Current development endpoints (not authenticated or tenant-isolated), each POST
with a 6 MB request ceiling:

| Endpoint | Current behavior |
| --- | --- |
| /api/reports/query | Execute bounded posted-JSON query and return schema/rows |
| /api/reports/export/csv | Query and download tabular CSV |
| /api/reports/export/xlsx | Query and download native XLSX |
| /api/reports/query/pdf | Query and render flowing dataset PDF via RenderDataset; <=12 columns, repeated headers and page count |

Designer preview passes reportData to the legacy PDF path; applying a query binds
ReportRows to a selected/new table but does not embed/persist data in template JSON.
Legacy fixed-height canvas table behavior is unchanged.

Proposed additional API surface (not currently available):

| Resource | Operations |
| --- | --- |
| /api/report-engines | Discover engines, template formats and export capabilities |
| /api/data-sources | Authorized CRUD, test connection, browse metadata |
| /api/datasets | Version definitions, validate AST/bindings, bounded preview |
| /api/reports | Catalog, create, clone, archive and ownership |
| /api/reports/{id}/versions | Draft save with ETag/If-Match, review and publish |
| /api/reports/{id}/runs | Submit validated run with version, parameters and output options; return 202 + run ID |
| /api/report-runs/{id} | Status, cancel, warnings, artifacts and authorized downloads |
| /api/schedules | Schedule CRUD, pause/resume and authorized run-now |

Keep existing /api/pdf endpoints during migration behind the same security and
validation controls. Address file-path containment for named templates and never
resolve arbitrary client-supplied paths. API errors use structured ProblemDetails
with correlation IDs; invalid requests must not expose SQL or connection strings.

## 10. Security and Nonfunctional Requirements

- SEC-01 (P0): Authenticate via the organization's OIDC/OAuth identity provider;
  apply report-, source-, dataset- and artifact-level authorization. CORS is not authentication.
- SEC-02 (P0): Derive tenant/user scope from trusted identity, not request payloads.
  Apply row/column security before previews, totals, caches, exports and subreports.
- SEC-03 (P0): Encrypt transport, secrets and stored sensitive artifacts. Redact
  connection credentials and protect development/test environments from live banking data.
- SEC-04 (P0): Disable arbitrary report scripting and external resource loading
  for untrusted templates. Validate XML safely, prevent XXE/path traversal/SSRF,
  limit uploads and isolate workers that must process untrusted report content.
- SEC-05 (P0): Enforce query timeout, rows/bytes/pages, job concurrency and per-user
  quotas. Do not use database credentials that permit data modification.
- NFR-01 (P0): Agree a reproducible baseline before release. Proposed initial
  targets on a recorded 4-vCPU/8-GB worker: 100-row preview p95 <= 3 seconds and
  10,000-row tabular PDF p95 <= 30 seconds, excluding external-source latency.
  These are proposed targets, not measured current performance.
- NFR-02 (P0): Load-test a 100,000-row XLSX and 1,000,000-row CSV, ten concurrent
  queued jobs, cancellation and worker restart. Record memory ceilings, duration
  and storage; tune limits before enabling workloads for users.
- NFR-03 (P0): Produce structured logs, traces and metrics for source/query/render
  duration, failures, queue delay and artifact size without sensitive payloads.
- NFR-04 (P1): UI targets WCAG 2.2 AA and keyboard operation. Accessible UI and
  accessible/tagged exported PDFs are separate acceptance tracks.
- NFR-05 (P0): Back up metadata/artifacts under approved retention, test restore,
  pin dependencies, scan packages and document license obligations.

## 11. Acceptance Scenarios

| Test | Required result |
| --- | --- |
| AT-01 Legacy invoice | Existing JSON template still produces correct PDF objects and totals through QuestPDF; no silent conversion. |
| AT-02 PDF pagination | 1,000 detail rows span pages with repeated headers, no missing/duplicate rows, correct totals and page numbering. |
| AT-03 Stored procedure | Typed date/customer parameters reach an approved read-only procedure; separate result sets bind to named datasets; unauthorized procedure fails. |
| AT-04 View and visual join | Customers LEFT JOIN Accounts retains customers without accounts; projection/order/filters match a reference query. |
| AT-05 LINQ projection | Registered provider returns a typed DTO projection; unsupported provider IDs and submitted executable text are rejected. |
| AT-06 Grouped collections | Customer -> Accounts -> Transactions produces correct nested subtotals and running balances, including empty child collections. |
| AT-07 Subreports | Parent ID maps to an approved child version; cycles are rejected and child data access remains tenant-scoped without per-row queries. |
| AT-08 Native XLSX | Workbook opens in Excel/LibreOffice, preserves 00123 as text and money within the agreed transport/workbook precision contract, and contains no executable formulas from untrusted input. Test browser precision boundaries explicitly; arbitrary-decimal round trips are not a current guarantee. |
| AT-09 CSV edge cases | Commas, quotes, Unicode, newlines, nulls and formula-leading strings follow selected policy; parsing recovers expected values. |
| AT-10 Snapshot parity | PDF, XLSX and CSV generated from one snapshot have equal detail-row counts and business totals where the projection is equivalent. |
| AT-11 Access isolation | User/tenant A cannot discover sources, preview rows, access cached results or download artifacts belonging to B. |
| AT-12 Lifecycle | Conflicting draft save returns a conflict; publishing pins report/dataset/subreport versions; rollback preserves audit history. |
| AT-13 Jobs and schedules | Cancel interrupts source/render work; retries do not duplicate deliveries; worker restart and DST policy behave as documented. |
| AT-14 Engine proof | Our own engine/UI passes grouped master-detail/subreport PDF/XLSX/CSV and versioned designer save/reopen tests on the deployment OS, with applicable dependency-license evidence and no FastReport integration. |
| AT-15 Schema drift | Removing a required source field flags dependent reports and blocks publication with a field-specific error. |

Create backend unit/integration tests, connector tests against disposable databases,
export parser assertions, selected PDF visual/text checks and browser end-to-end
tests. Frontend tests alone do not establish report-engine or export correctness.

## 12. Delivery Plan and Dependencies

| Phase | Deliverables | Exit gate |
| --- | --- | --- |
| 0: Baseline and proof | Independent engine direction is settled; confirm target OS, first database, representative reports and output benchmarks | Recorded scope, measurable acceptance and applicable existing-package license review; no FastReport procurement |
| 1: Secure foundation and exports | Identity, authorization, catalog/version storage, engine/export contracts, jobs/artifacts, typed JSON datasets, preserve PDF, native data-mode XLSX and CSV | AT-01/02/08/09/10/11/12 pass for available layout features |
| 2: Governed data access | SQL Server tables/views/procedures, approved LINQ providers, parameters, source administration and dataset previews | AT-03/05/15 plus connector/security tests |
| 3: Enterprise visual queries | Extend implemented JSON builder with governed sources, multi-key joins/ON predicates, OR/HAVING, parameters and our capability-aware designer | AT-04 and relevant AT-14 coverage; no regression of legacy templates |
| 4: Advanced reporting | Nested grouping, master-detail collections, subreports, conditional expressions and pagination controls | AT-06/07 and multi-page/export compatibility tests |
| 5: Operations and expansion | Schedules/delivery, retention, additional connectors, charts/pivots and cross-source joins as approved | AT-13, recovery/load tests and operational sign-off |

P0 is a production gate for each exposed capability, not a claim that every P0
item is implementable before its dependent phase. Do not expose advanced layouts
until their PDF/export/security acceptance tests pass. Estimates require package
selection, a representative report set and product-owner prioritization.

The JSON builder/export slice precedes this production sequencing and is partial
progress, not completion of phases 1 or 3. Track banking controls and scaling gates
in [enterprise delivery status](enterprise-delivery-status.md).

## 13. Decisions Requiring Confirmation

1. Our own engine/UI is settled; which representative report pack defines the first enterprise acceptance scope?
2. Is this an internal banking tool, an embedded application feature, or a
  standalone/multi-tenant reporting product? Confirm tenancy, deployment and existing dependency obligations.
3. Which database versions, deployment OS, network locations and identity provider
   must the first release support?
4. Is Excel initially data-first, or must it reproduce page layout? Data-first is
   the proposed mandatory baseline; layout fidelity is a separate capability.
5. Which procedures, LINQ providers, sensitive fields and sample reports are approved?
6. Are signing, PDF/A, accessible PDF, regulatory retention and maker-checker approval mandatory?
7. What are the required maximum rows/pages, concurrency, refresh policy and budget?

## 14. Research Sources

Accessed 2026-10-28. Competitive references only, not implementation instructions
or vendor-procurement requirements. Vendor pages can change. Our requirements
are independently defined; existing dependencies retain their license obligations.

- [FastReport .NET product](https://www.fast-report.com/products/fast-report-net):
  .NET integration, banded layouts, grouping, subreports and commercial delivery options.
- [Official FastReport Open Source repository](https://github.com/FastReports/FastReport):
  data sources, IEnumerable objects, bands, template options, export limitations,
  PdfSimple plugin and Community Designer licensing distinction.
- [FastReport commercial license](https://www.fast-report.com/license/license-agreement-net):
  review particularly section 3.1 restrictions relevant to report-generator products.
- [Official documentation index](https://www.fast-report.com/downloads/documentation):
  competitive feature reference; detailed
  export documentation was not successfully extracted in this research pass.

This specification describes independent business requirements, not a commitment
to clone proprietary UI, redistribute vendor code or bypass edition restrictions.