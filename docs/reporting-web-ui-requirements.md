# Reporting Web UI Requirements

Status: Current development-slice inventory plus proposed enterprise requirements; not production-ready.
Review date: 2026-10-28.
Companion: [Reporting system requirements](reporting-system-requirements.md).

## 1. Product Direction

Build on the existing Angular designer rather than creating a marketing site.
The experience is an operational banking/reporting workspace: dense but readable
tables, predictable navigation, explicit permissions, safe data previews and a
PDF-first viewer. Preserve existing canvas tools and JSON templates.

Build OUR OWN scalable enterprise engine/UI using existing packages, including
Fabric.js and QuestPDF. FastReport is only a competitive capability benchmark:
no FastReport code/package, adapter or designer integration, and no second-engine
assumption. Application ownership does not confer ownership of dependencies;
their applicable license obligations remain.

P0/P1/P2 priorities and backend requirements are defined in the companion document.
Every proposed UI action needs an authorized backend contract; hiding a button
does not enforce security. Engine capabilities control available design/export
options, not assumptions about a purchased product name.

## 2. Existing UI and Remaining Work

| Surface | Already present | Required addition |
| --- | --- | --- |
| Canvas | Object tools, selection/property editing, positioning, layers, undo/redo | Band mode, relations, conditional formatting and structured data binding |
| Page settings | Size/orientation, margins, watermark, pagination, header/footer presets | Group/page-break policies, overflow diagnostics and server preview parity |
| Templates | Starter gallery, local save/load, JSON import/export | Shared catalog, server save, immutable published versions and review |
| Data | Data button opens visual JSON collection builder with sample/upload sources, nested scalar discovery, join selector, fields/aliases/aggregates, AND filters, group/sort and preview | Governed connectors, typed parameters, multi-key/ON joins, OR/HAVING and durable dataset catalog |
| Images | Image/logo upload and fit modes | Governed reusable assets, storage limits and accessible metadata |
| Viewer / export | Builder CSV/XLSX/flowing PDF downloads; designer preview passes reportData; result binds selected/new table to ReportRows | Unified governed run viewer, retained snapshots and async export jobs; canvas tables remain fixed-height |
| Administration | No managed data-source or permission screens found | Source setup, role permissions, audit and runtime diagnostics |

Evidence: [designer logic](../frontend/src/app/app.ts),
[designer markup](../frontend/src/app/app.html),
[types](../frontend/src/app/types.ts),
[PDF endpoints](../backend/Controllers/PdfController.cs),
[builder](../frontend/src/app/report-data-builder.ts),
[reports API](../backend/Controllers/ReportsController.cs).

### Current Data Workflow and Limits

At http://localhost:4201: Data -> sample/upload JSON -> configure -> Run ->
inspect preview -> Apply to a selected/new table, or export CSV/XLSX/PDF.
Save/load query JSON is available. Query edits clear stale results; active
requests can be cancelled. Uploaded JSON is capped at 5 MB; the builder allows
8 sources, 10,000 total source rows and 128 discovered scalar fields. Display is
bounded to 100 result rows; Apply uses the full result up to 10,000 rows.

The API accepts posted JSON (6 MB ceiling), qualified nested scalar fields,
ordered single-key INNER/LEFT joins with NULL keys never matching and intermediate
output capped at 10,000 rows. AND filters support eq/ne/gt/gte/lt/lte/contains/isNull/notNull;
select supports field/alias, groupBy supports sum/count/average/min/max decimal
aggregations, and sorting is stable across multiple columns. This is not full SQL;
ON predicates and OR/HAVING are not implemented. Dataset PDF repeats headers and
page count with <=12 columns; legacy canvas table layout has not become flowing.

ReportRows is runtime data, not embedded/persisted in template JSON. Query JSON
save/load does not supply durable snapshots or versioned report persistence.
.NET decimal computation in the API does not prevent JavaScript number precision
loss on browser parsing/serialization; do not promise exact arbitrary-decimal
banking round trips. No live SQL/bank sources, procedures/views or registered LINQ
providers are available. Authentication, tenant isolation, source credentials,
durable persistence, snapshots, jobs and audit are not built. Use synthetic data.

Current evidence: 98 frontend tests passing, .NET executable query/export checks,
and live API/error checks including a 1,000-row, 33-page PDF. These do not establish
enterprise UI/security acceptance. See [delivery status](enterprise-delivery-status.md)
for the observable banking backlog; the requirements below remain targets unless
the inventory above explicitly records a bounded implementation.

## 3. Navigation and Routes

| Proposed route | Screen | Primary users |
| --- | --- | --- |
| /reports | Report catalog | Viewers, analysts, designers |
| /reports/:id | Report details, versions and dependencies | Report owners and reviewers |
| /reports/:id/design | Existing designer extended with data/band panels | Designers |
| /reports/:id/run | Parameters and PDF-first viewer | Authorized report consumers |
| /data-sources | Connection catalog and source editor | Data administrators |
| /datasets | Reusable datasets | Analysts and designers |
| /datasets/:id/edit | Tables, relations, filters and projection builder | Authorized analysts |
| /runs | Run queue, history and downloads | Requesters and operators |
| /schedules | Recurring runs and delivery | Authorized schedulers |
| /administration | Permissions, audit and operational limits | Administrators |

UI-01 (P0): Use a compact application shell with report/dataset/source navigation,
workspace or tenant identity where relevant, user menu and visible environment.
Persist sensible list filters without storing sensitive parameter values locally.

UI-02 (P0): Route guards improve navigation but APIs remain authoritative. Show
permission-denied, not-found, offline and expired-session states without leaking
restricted source names or cached report content.

## 4. Report Catalog and Lifecycle

UI-03 (P0): Use a searchable table showing name, folder/tags, owner, engine,
draft/published/archived state, version and updated time. Support sorting, paging,
saved filters and authorized create/clone/archive actions.

UI-04 (P0): Creating a report selects our supported template format/layout mode,
starter/blank layout and dataset. Explain incompatible capabilities through
concise validation; do not assume a second engine or automatic layout conversion.

UI-05 (P0): The details screen shows description, parameters, export profiles,
versions, dataset/subreport dependencies, permissions and recent runs. Keep
review/publish distinct from draft save. Display unsaved, saving, saved and failed
states and resolve ETag/version conflicts without silent overwrites.

UI-06 (P1): Support version comparison, reviewer comments, rollback-as-new-version,
deployment bundle import/export and missing-dependency resolution. Imports must
never request or display live credentials embedded in a template.

## 5. Data Source Administration

UI-07 (P0): Provide a provider selector, display name, environment, database/host,
authentication mode, secret reference, timeout and owner. Secret inputs are
write-only or replaced by approved secret-store references; returned API models
must never include passwords. Show test status and a redacted error.

UI-08 (P0): Browse approved schemas, tables, views and stored procedures with
search and type badges. Show columns, keys, nullability and result-set schemas.
An administrator explicitly grants objects/columns to report authors.

UI-09 (P0): For stored procedures show the approved identifier, input parameters,
types, defaults, required flags and named result sets. Read-only text is shown
for output metadata; selecting a procedure does not enable arbitrary execution.

UI-10 (P1): Source-type options include SQL Server, PostgreSQL, registered LINQ
provider, HTTP/JSON and uploaded JSON/CSV/XLSX, enabled only when the corresponding
backend adapter is available. Connector setup forms are provider-specific.

UI-11 (P1): File import includes sheet/delimiter/header selection, schema/type
mapping, row errors and preview. HTTP setup includes approved host and pagination
options. Neither screen evaluates uploaded formulas or accepts unrestricted URLs.

## 6. Dataset Builder: Tables, Joins and Projection

Use three working regions: searchable source browser, relationship canvas, and
query configuration/results. Tabs within the lower region are Fields, Filters,
Groups, Sort, Parameters and Preview. Generated SQL is a read-only inspector by
default. Do not frame every region as a floating card.

UI-12 (P1): Add tables/views from the source browser to the canvas. Each item
shows alias, keys and columns. Drag key-to-key or use a keyboard-accessible join
dialog; both paths create the same validated join definition.

UI-13 (P1): A join editor selects INNER/LEFT, left/right aliases, one or more key
pairs and ON filters. Display cardinality and row-multiplication warnings. Keep
post-join WHERE filters visually distinct. Block invalid joins with field-specific
messages rather than silently coercing types.

UI-14 (P1): The projection grid contains include, source field/expression, alias,
type, aggregate, format and order. Reordering controls are keyboard accessible.
Duplicate aliases and invalid grouped projections block save/publication.

UI-15 (P1): A filter builder supports nested AND/OR groups, field-appropriate
operators, null tests, literal/parameter operands and multi-value inputs. An
expression editor offers approved functions and typed field insertion, not
arbitrary C# execution.

UI-16 (P1): Configure GROUP BY/HAVING and stable sort order. Show when results
are already aggregated so report designers do not count totals twice. Provide
explicit policies for nulls, date boundaries and monetary rounding.

UI-17 (P0): Preview is user-triggered, cancellable, masked by policy and capped
at the server limit. Show returned rows, sample/limit label, duration, schema
warnings and freshness. A 100-row sample must never be labeled as a full report.

UI-18 (P1): Save versioned reusable datasets independently from reports; show
dependent reports and schema drift before publish. Advanced SQL editing is a
separate permission-controlled workflow with validation and approval.

UI-19 (P0): LINQ mode selects a registered application provider and its typed
parameters/projection schema. Do not expose a browser C# compiler or accept
freeform executable LINQ text as a query definition.

## 7. Designer Extensions

UI-20 (P0): Preserve current layout editing and import/export. Add a dataset/schema
tree with typed fields and nested relations; drag a scalar into text and a
collection into a table/repeater. Provide equivalent keyboard insertion actions.

UI-21 (P1): Engine-supported band mode shows title, header/footer, detail, groups
and summary with stable dimensions. Existing absolute-coordinate mode remains
available for legacy JSON templates; switching modes requires a validated path.

UI-22 (P1): The group panel configures fields, sort, header/footer, subtotal scope,
running balance, keep-together and new-page behavior. Visual object grouping has
separate controls and must not change dataset aggregation.

UI-23 (P1): Collection bindings select parent-child relation, child dataset,
empty behavior and column projection. Show a small sample without flattening
unrelated nested arrays into a Cartesian product.

UI-24 (P1): A subreport picker lists only authorized published report versions,
then edits typed parent-to-child parameter mappings. Display the pinned child
version and reject cycles, missing mappings and incompatible engine composition.
Cross-layout composition is disabled until our engine explicitly validates it.

UI-25 (P1): Add conditional visibility/formatting, typed calculations and locale
formatting with validation and safe expression previews. Errors link to the
affected object/field without exposing sensitive runtime values.

UI-26 (P0): Preview and publish validation identify missing fields, unsupported
objects/exports, clipped content, unresolved fonts/assets and broken dependencies.
Warnings and blocking errors are distinguishable; selecting an error focuses its
object. Never silently omit unsupported objects from an export.

UI-27 (P1): Extend our Angular/Fabric designer for our engine's versioned layout,
bands and reusable components. The server owns authorized loading/saving and
revalidates templates; never expose credentials, filesystem locations or arbitrary
callback URLs. Verify session expiry, unsaved changes, save/reopen compatibility,
keyboard authoring and accessibility. No FastReport designer or code/package
integration is permitted; competitive capability research is reference only.

## 8. Parameters, Viewer and Export

UI-28 (P0): Render a parameter form from versioned definitions with required/type
validation, dates/date ranges, lookup selections, multi-select and cascading
lookups. Show locale/timezone. Validate server-side and never persist sensitive
values in URLs, analytics or browser storage.

UI-29 (P0): Run submits one published version and parameters, then shows queued,
running, failed, cancelled or completed state. Completed reports open in a
server-rendered PDF viewer with page navigation, zoom, fit-width, print and
download. Display run/version/freshness details without obstructing the document.

UI-30 (P0): Export presents PDF first, then Excel (.xlsx) and CSV. Use a familiar
download icon plus a format menu. Options depend on server capabilities and
permissions; a clear reason accompanies an unavailable format.

UI-31 (P0): Excel options distinguish data mode from separately supported layout
mode, dataset/sheet selection, headers and formatting. CSV options include dataset,
delimiter, encoding/BOM, headers and spreadsheet-safe text policy. Display the
selected dataset's projected columns; do not offer layout fidelity for CSV.

UI-32 (P0): PDF and data exports from the same run use its retained snapshot.
Refreshing data creates a new run with a new freshness label. A stale/expired
snapshot requires explicit rerun rather than silently mixing results.

UI-33 (P0): Long exports appear in the run list with cancellation, safe errors,
retry and expiring download links. Downloads recheck authorization; logout or
revocation clears restricted viewer state and cached client content.

## 9. Schedules, History and Administration

UI-34 (P1): Run history offers report/status/date/requester filters, authorized
artifact downloads and redacted diagnostics. Operators can inspect correlation
IDs and duration without unrestricted access to report data.

UI-35 (P1): Schedule setup selects a published version, parameter profile, formats,
calendar/timezone, recipients/destination and retry policy. Show next run times,
DST policy and pause/resume state. Prevent unauthorized delivery recipients.

UI-36 (P1): Administration includes per-report/source/dataset permissions, audit
filters, retention settings and operational limits. Destructive actions use
explicit confirmation and distinguish archival from permanent deletion.

## 10. Interaction, Accessibility and Responsive Behavior

UI-37 (P0): Extend the existing visual language: compact tables and toolbars,
restrained color, readable labels, stable sidebar widths and no decorative nested
cards. Use tooltips/accessible names for icon-only tools, toggles for binary
settings, numeric inputs for dimensions, and tabs for working views.

UI-38 (P0): Cover loading, empty, validation error, backend failure, cancellation,
connection failure, permission denial and concurrency conflict states. Preserve
unsaved work where safe; never display fake success before server confirmation.

UI-39 (P1): Target WCAG 2.2 AA: keyboard focus, contrast, labeled controls,
screen-reader state announcements, accessible grids and non-drag alternatives.
Our canvas editor needs a documented accessible object/property workflow.

UI-40 (P1): Test desktop at 1440x900 and 1024x768; mobile at 390x844. Catalog,
parameters, history and downloads work on mobile. Complex authoring is
desktop-first; mobile uses a full-screen panel/inspector and explicit navigation
without overlapping text, clipped actions or unusable scaled-down canvases.

## 11. End-to-End UI Acceptance

| Scenario | Expected result | System trace |
| --- | --- | --- |
| Browser-local migration | Import an existing JSON design, save it to server and reopen without losing objects; original local copy remains until confirmed migration | ENG-03, MGMT-01 |
| Visual joins | Add two approved tables, create LEFT join, choose projected columns and preview unmatched rows | QUERY-01 through QUERY-04, AT-04 |
| Procedure setup | Select approved procedure, enter typed dates and bind named result sets without seeing credentials | DATA-04, AT-03 |
| LINQ source | Select registered provider and parameters; returned DTO schema appears in field tree | DATA-06, AT-05 |
| Group and subreport | Bind a nested collection, add group totals and mapped subreport, detect a dependency cycle | LAYOUT-04 through LAYOUT-08, AT-06/07 |
| PDF-first export | Run with parameters, inspect paginated PDF and download real PDF/XLSX/CSV from the same snapshot | PDF-01, XLSX-01, CSV-01, AT-10 |
| Save conflict | Two sessions edit the same draft; second save offers conflict resolution without overwriting | MGMT-02, AT-12 |
| Unauthorized access | Direct routes, previews and download URLs reject unauthorized access without exposing cached data | SEC-01/02, AT-11 |
| Engine limits | Unsupported subreport/export cannot publish and shows a specific validation error | ENG-04, UI-26 |
| Mobile and keyboard | Complete catalog -> parameter form -> run -> download without pointer-only actions or clipped content | UI-39/40 |

UI implementation should follow the production gates in the system specification.
The current usable increment is the bounded JSON data builder and export workflow,
not the proposed secure shared catalog. Authentication, shared persistence,
parameter/run viewer and operational controls still require implementation and
acceptance. Advanced query/layout controls follow our backend contracts, not
universal competitor-parity claims.