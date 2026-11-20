# Banking System Integration

## Integration Point

Call this reporting API from the banking application's **backend reporting or
application-service layer**, after checking user permissions and retrieving the
approved report rows. Do not connect a browser directly to the core banking
database or expose database credentials to this designer.

```text
Banking UI: report parameters and download
                  |
Banking backend: identity, branch/account scope, approved query/procedure/LINQ
                  |
Materialize one authorized, consistent dataset
                  |
Reporting API: project/filter/group/sort once -> Excel + CSV + PDF + Word
                  |
Banking backend: return ZIP or store artifacts + manifest under retention policy
```

The repository does not contain your banking application, database schema or
identity provider. The service-to-service call below is the integration contract;
it is not a completed connection to your bank.

## Export Contract

POST a ReportQuery JSON body to:

| Endpoint | Output |
| --- | --- |
| /api/reports/export/xlsx | Native Excel workbook (.xlsx) |
| /api/reports/export/csv | UTF-8 CSV (.csv) |
| /api/reports/export/pdf | Flowing tabular PDF (.pdf) |
| /api/reports/export/docx | Editable Word table document (.docx) |
| /api/reports/export/all | ZIP containing all four and manifest.json |

For **the same dataset in all formats**, use `all`. The API evaluates the posted
query exactly once and passes the same ordered columns and rows to each writer.
The entire request fails if any format cannot be produced; no partial ZIP is
returned. Separate export requests each evaluate their own submitted query.

The manifest contains an export ID, UTC generation time, input/output row counts,
ordered column metadata and each artifact's MIME type, byte size and SHA-256.
Checksums establish file integrity, not a digital signature or bank authorization.
The server does not currently persist this bundle or provide later retrieval by ID.

### Example Request

Already projected bank rows can be submitted as a single collection with no joins:

```json
{
  "sources": [{
    "alias": "Statement",
    "fields": ["AccountNumber", "PostingDate", "Description", "Amount", "Currency"],
    "rows": [
      { "AccountNumber": "0012345", "PostingDate": "2026-10-28", "Description": "Deposit", "Amount": 125.50, "Currency": "USD" },
      { "AccountNumber": "0012345", "PostingDate": "2026-10-28", "Description": "Payment", "Amount": -25.00, "Currency": "USD" }
    ]
  }],
  "from": "Statement",
  "select": [
    { "field": "Statement.AccountNumber", "alias": "AccountNumber" },
    { "field": "Statement.PostingDate", "alias": "PostingDate" },
    { "field": "Statement.Description", "alias": "Description" },
    { "field": "Statement.Amount", "alias": "Amount" },
    { "field": "Statement.Currency", "alias": "Currency" }
  ],
  "joins": [], "filters": [], "groupBy": [], "sort": []
}
```

Keep identifiers such as account numbers as strings. Materialize rows within the
bank's approved read-consistency/as-of policy before the call. Do not reread live
transactions separately for each file.

### .NET Banking Backend Call

Register an HttpClient with a configured reporting-service base URL and timeout.
Inside the bank's authorized application service, send the request and stream the
response to controlled artifact storage or the authenticated download response:

```csharp
using System.Net.Http.Json;

public static async Task ExportStatementAsync(
    HttpClient reportingClient,
    object authorizedReportQuery,
    Stream destination,
    CancellationToken cancellationToken)
{
    using var request = new HttpRequestMessage(HttpMethod.Post, "api/reports/export/all")
    {
        Content = JsonContent.Create(authorizedReportQuery)
    };
    using var response = await reportingClient.SendAsync(
        request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
    response.EnsureSuccessStatusCode();
    if (response.Content.Headers.ContentType?.MediaType != "application/zip")
        throw new InvalidOperationException("Reporting service did not return an export bundle.");
    await response.Content.CopyToAsync(destination, cancellationToken);
}
```

Use the bank's service authentication and TLS policy when those controls are
implemented. Validate report IDs/parameters and derive tenant/branch scope from
trusted identity on the backend, not from caller-provided row filters alone.

## Download vs Permanent Storage

The current UI downloads files to the user's browser. For durable bank storage,
the banking backend must store the returned ZIP (or its four artifacts and
manifest) in approved encrypted object/document storage. Keep an authorized
database record containing the bank's report ID/version, parameter references,
as-of date, requester, export ID, object key, checksum and retention/legal-hold
policy. Do not store credentials or sensitive raw parameters in the manifest/logs.
This storage, access control and audit integration is not implemented here.

## Scope and Safety Limits

- 6 MiB API request limit, 10,000 total input rows and intermediate join rows.
  Interactive results have a bounded text budget; large reports need a future
  durable background-job pipeline rather than increasing limits without testing.
- All-formats, PDF and Word exports support at most 12 projected columns.
  Excel and CSV individually support up to 256 columns.
- These exports share **data**, not identical page layout. Word/PDF are tabular
  documents; Excel is a workbook; CSV has no styling. This endpoint does not
  reproduce arbitrary canvas images, QR codes or letterhead in Word/Excel/CSV.
- CSV protects formula-leading strings, so those strings may gain a leading
  apostrophe. Nulls become empty cells/text. Excel has numeric precision limits;
  Word/PDF present values as text. Consumers must not assume byte-identical values
  or typed null preservation across all file formats.
- Server query arithmetic uses .NET decimal. Avoid browser numeric round trips
  for high-precision money; send directly from the bank backend. Excel cannot
  represent arbitrary-precision decimals natively; an explicit bank-approved
  rounding/text-export policy is still required.
- Current APIs have no production authentication, tenant isolation, durable audit
  or storage controls. Test with synthetic data only until those gates are met.
- DOCX has automated ZIP/XML/value tests, but has not been opened in desktop Word
  as part of this verification. Office compatibility review remains a release gate.

## Try in the Designer

Open http://localhost:4201, select **Data**, configure/upload synthetic collections,
then **Execute**. Use **Word** for DOCX or **ZIP All formats** for one export set.
Saving the layout/query JSON is separate from storing the generated documents.