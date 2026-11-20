using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using AutobankerReportsManager.Services;
using Microsoft.AspNetCore.Mvc;

namespace AutobankerReportsManager.Controllers;

[ApiController]
[Route("api/reports")]
[RequestSizeLimit(6 * 1024 * 1024)]
public sealed class ReportsController(IReportRenderer renderer) : ControllerBase
{
    [HttpPost("query")]
    public IActionResult Query([FromBody] ReportQuery query, CancellationToken cancellationToken)
    {
        try { return Ok(ReportQueryEngine.Execute(query, cancellationToken)); }
        catch (ArgumentException error) { return InvalidQuery(error); }
    }

    [HttpPost("export/{format}")]
    public IActionResult Export(string format, [FromBody] ReportQuery query, CancellationToken cancellationToken)
    {
        if (format is not ("csv" or "xlsx" or "pdf" or "docx" or "all"))
            return Problem(statusCode: 400, title: "Unsupported export format", detail: "Choose csv, xlsx, pdf, docx or all.");
        try
        {
            var result = ReportQueryEngine.Execute(query, cancellationToken);
            if (format == "all") return Bundle(result, cancellationToken);
            var artifact = CreateArtifact(format, result, cancellationToken);
            return File(artifact.Bytes, artifact.ContentType, $"report.{format}");
        }
        catch (ArgumentException error) { return InvalidQuery(error); }
    }

    [HttpPost("query/pdf")]
    public IActionResult Pdf([FromBody] ReportQuery query, CancellationToken cancellationToken)
    {
        try
        {
            var result = ReportQueryEngine.Execute(query, cancellationToken);
            if (result.Columns.Count > 12)
                return Problem(statusCode: 400, title: "Too many PDF columns", detail: "Select at most 12 fields for a readable PDF, or use Excel/CSV.");
            cancellationToken.ThrowIfCancellationRequested();
            var bytes = renderer.RenderDataset(result);
            return File(bytes, "application/pdf", "report.pdf");
        }
        catch (ArgumentException error) { return InvalidQuery(error); }
    }

    private (byte[] Bytes, string ContentType) CreateArtifact(string format, QueryResult result,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return format switch
        {
            "csv" => (TabularReportExporter.Csv(result.Columns, result.Rows), "text/csv; charset=utf-8"),
            "xlsx" => (TabularReportExporter.Xlsx(result.Columns, result.Rows), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            "docx" => (TabularReportExporter.Docx(result.Columns, result.Rows), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            "pdf" => (renderer.RenderDataset(result), "application/pdf"),
            _ => throw new ArgumentException("Unsupported export format.")
        };
    }

    private FileContentResult Bundle(QueryResult result, CancellationToken cancellationToken)
    {
        if (result.Columns.Count > 12)
            throw new ArgumentException("Select at most 12 fields for an all-formats bundle because PDF and Word have a 12-column limit.");
        var exportId = Guid.NewGuid().ToString("N");
        var createdAtUtc = DateTimeOffset.UtcNow;
        var files = new List<object>();
        using var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var format in new[] { "xlsx", "csv", "pdf", "docx" })
            {
                var artifact = CreateArtifact(format, result, cancellationToken);
                var name = $"report.{format}";
                using (var stream = archive.CreateEntry(name, CompressionLevel.Fastest).Open())
                    stream.Write(artifact.Bytes);
                files.Add(new
                {
                    name, contentType = artifact.ContentType, sizeBytes = artifact.Bytes.Length,
                    sha256 = Convert.ToHexString(SHA256.HashData(artifact.Bytes)).ToLowerInvariant()
                });
            }
            cancellationToken.ThrowIfCancellationRequested();
            using var manifest = archive.CreateEntry("manifest.json").Open();
            JsonSerializer.Serialize(manifest, new
            {
                schemaVersion = "1.0", exportId, createdAtUtc, rowCount = result.Rows.Count,
                inputRowCount = result.InputRows, columns = result.Columns, files
            }, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, WriteIndented = true });
        }
        return File(output.ToArray(), "application/zip", $"report-{exportId}.zip");
    }

    private ObjectResult InvalidQuery(ArgumentException error) =>
        Problem(statusCode: 400, title: "Invalid report query", detail: error.Message);
}