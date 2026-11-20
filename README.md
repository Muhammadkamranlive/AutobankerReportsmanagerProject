# Autobanker Reports Manager

Our own Angular report designer and ASP.NET Core reporting engine, using the
existing Fabric.js and QuestPDF packages. FastReport is a competitive capability
benchmark only: no FastReport code, package, adapter or designer integration.

## Reporting Requirements

- [Banking integration](docs/banking-integration.md): backend integration point,
  same-result Excel/CSV/PDF/Word bundle, example request and storage responsibilities.
- [System requirements and gap analysis](docs/reporting-system-requirements.md):
  Independent engine requirements, competitive research, PDF/XLSX/CSV, governed data sources,
  visual joins/projections, grouping, subreports, security and delivery phases.
- [Web UI requirements](docs/reporting-web-ui-requirements.md): proposed screens,
  workflows, existing UI capabilities, missing features and acceptance criteria.

- [Enterprise delivery status](docs/enterprise-delivery-status.md): current
  development slice, evidence, banking controls and observable backlog acceptance.

Requirements are targets, not a completion claim. The JSON query/builder and
tabular exports below are implemented; production security and operations are not.
We own our application code, not third-party dependencies. Existing packages remain
allowed, with their applicable license and redistribution obligations.

## Layout

```text
autobanker-reports-manager/
  frontend/   Angular 21, Tailwind CSS, Fabric.js designer
  backend/    .NET 8 query/PDF/export APIs, models, templates and renderers
  .vscode/    Build, test and development tasks
```

The original projects remain unchanged in `../pdfdesinger/`. In particular, the Next.js frontend remains in `../pdfdesinger/frontend/`; it is not included in this combined project. This is an independent copy, not a symlink.

## Requirements

- Node.js `^20.19.0 || ^22.12.0 || >=24.0.0` and npm
- .NET 8 SDK

## Setup

Run from this directory:

```sh
npm run setup
```

This installs the locked frontend dependencies and restores backend packages. Generated dependencies, caches and build outputs were excluded from the source copy.

## Run

Open `autobanker-reports-manager.code-workspace` in VS Code and run the `start-all` task, or start these commands in separate terminals:

```sh
npm run start:backend
```

```sh
npm run start:frontend
```

- Designer: http://localhost:4201
- PDF sample: http://127.0.0.1:5081/api/pdf/sample
- Swagger in Development: http://127.0.0.1:5081/swagger

The frontend proxies `/api` to port 5081. These ports are separate from the original designer's 4200/5080 pair so both copies can run at the same time.

## Validate

```sh
npm test
npm run build
```

`npm test` runs frontend tests followed by
the .NET query and CSV/XLSX/DOCX checks. Run either slice separately with
`npm run test:frontend` or `npm run test:engine`. With the backend running,
run the live API/error/PDF checks separately:

```sh
npm run test:api
```

The live checks verified a 1,000-row flowing PDF spanning 33 pages. This is not a
load test or evidence of complete enterprise acceptance.

## Save and Test Templates

1. Design a report or choose a starter template, then click **Save template**.
  This writes the template to the server, not just browser storage. Subsequent
  saves update the same server template. Starting a new report or choosing a
  starter creates a new saved template on its next save.
2. Open **Test Reports**, select a server template, and click **Generate test report**.
  Synthetic test data is already available in the frontend. The page shows the
  data snapshot and the generated PDF, and can reopen the saved template in the designer.
3. Download **PDF**, **CSV**, **Excel**, **Word**, or **All files (ZIP)**. All downloads
  come from one generation request using one saved template and one frontend data
  snapshot. The ZIP also includes the template, sample JSON, and a checksum manifest.

PDF retains the designed canvas layout, images and charts. CSV, Excel and Word
are content exports: they include resolved text/KPIs, table cells and chart
categories/values in Section/Row/Field/Value columns. They do **not** reproduce
the PDF's graphical layout. CSV cannot carry charts or styling. Existing fixed-height
canvas tables still clip to their designed area in PDF; content exports include
all bound rows, up to 10,000 exported content cells.

Templates default to `backend/SavedTemplates/{generated-id}.json`. Configure
`TemplateStorage:Path` in the backend settings or an environment variable to use
a server folder or mounted shared folder:

```sh
TemplateStorage__Path=/Volumes/Reports/Templates npm run start:backend
```

Relative paths resolve under the backend content root. The server process needs
read/write permissions on the folder. Writes use temporary files and atomic
replacement; names cannot select filesystem paths. Shared storage uses
last-write-wins updates, not version control or collaborative locking.
No authentication or per-user authorization is implemented, so these endpoints
must remain behind trusted development/internal access until those controls exist.

Dummy data stays frontend-owned. Saving remembers a test-data snapshot in browser
storage when available; another browser regenerates synthetic data for the template.
The ZIP preserves the exact input for an individual generation. Legacy browser
templates remain accessible with the legacy open icon and can be saved to the server.

With the backend running, `npm run test:templates` verifies persistence, matching
content across formats, identical individual/ZIP artifacts, hashes and bad inputs.
It creates a verification template in the configured server storage folder.

## Use the Data Builder

## Banking Dashboards

At http://localhost:4201, open **Templates** and select **Banking Dashboards**:

- Daily Branch Operations
- Accounts and Wallet Openings
- Daily Transactions & Balances
- ATM Activity
- Vault Cash Position

Each landscape template loads colorful KPI bands, native bar/line/donut charts
and a 12-branch detail table. **Sample data** downloads the compact aggregate
JSON; **Preview PDF** renders charts and the bound values on the server.
The Chart tool also adds editable charts with source, category, series and color
controls. Charts support at most 20 categories and four series; donut charts
require one nonnegative series. Invalid data displays a named chart error.

Samples simulate the local business date, not live activity: 7,020 account
openings, 3,746 wallet openings, 15,070 transactions, 3,017 ATM withdrawals and
960 vault movements. Events aggregate in integer USD cents before display.
Customer deposit closing = opening + credits - debits; vault closing = opening
+ cash in - cash out. ATM withdrawals are included in customer debits rather
than counted as additional transactions. Vault cash is a separate physical balance.

Only compact aggregate datasets are sent to PDF preview. Saving a template saves
bindings, not its sample data; reopening a dashboard from the gallery regenerates
the sample. Production replacements must supply the same dataset/field bindings
through the authorized banking backend. Excel/CSV/Word remain tabular exports;
chart layout export to those formats is not implemented.

## Data Queries

At http://localhost:4201, open **Data**, choose sample data or upload JSON,
configure sources/joins/fields/aliases/aggregates/filters/groups/sorts, then
**Execute**. Inspect the first 100 result rows and use **Apply to report** to bind the full
bounded result (up to 10,000 rows) to a selected or new report table as `ReportRows`.
Export CSV, XLSX, flowing PDF or Word (DOCX). **ZIP All formats** evaluates the
query once and includes all four plus a checksum manifest. You can also save/load
the query definition as JSON.
Editing a query clears stale results; an active request can be cancelled.

The browser accepts JSON files up to 5 MB, up to 8 sources, 10,000 total source
rows and 128 discovered scalar fields, including nested scalar paths. The engine
supports ordered single-key INNER/LEFT joins (NULL keys never match), AND filters
(`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains`, `isNull`, `notNull`), field/alias
projection, `groupBy`, decimal `sum`/`count`/`average`/`min`/`max` aggregates and
stable multi-column sorting. Intermediate join output is bounded at 10,000 rows.
Scalar text is limited to 32,767 characters, with a 5 MiB aggregate result-text
budget to prevent oversized interactive responses after join expansion.
This is not full SQL: ON predicates, OR and HAVING are not implemented.

Current endpoints are `POST /api/reports/query`,
`POST /api/reports/export/{format}` (`csv`, `xlsx`, `pdf`, `docx`, `all`) and
`POST /api/reports/query/pdf`, with a 6 MB request ceiling. CSV/XLSX/DOCX use native
.NET export code without new dependencies. Flowing PDF repeats headers and shows
page counts. PDF, Word and the all-formats bundle support at most 12 columns;
legacy canvas tables remain fixed-height. Downloads are not permanent server storage.
Designer PDF preview passes `reportData`, but data is not embedded or persisted
in template JSON. Saving a query definition is not a durable report snapshot.

API numeric computation uses .NET `decimal`, but browser JavaScript numbers can
lose precision before posting or after parsing results. Exact arbitrary-decimal
banking round trips are not guaranteed; currency/rounding and transport contracts
still need enterprise acceptance.

**Not production-ready:** authentication, tenant isolation, source credential
management, durable persistence, snapshots, jobs and audit are not built. Use
synthetic JSON only, not live banking data. SQL connectors, stored procedures,
views, registered LINQ providers, subreports, bands, charts, pivots and scheduling
remain backlog items.

See [frontend/README.md](frontend/README.md) for designer features and logo uploads,
and [backend/README.md](backend/README.md) for legacy PDF endpoints and the template
data contract. The status document above records the newer query/export slice.