using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using AutobankerReportsManager.Models;

namespace AutobankerReportsManager.Services;

public record TemplateTestFile(string Format, string ContentType, string Base64);

public static class TemplateTestExporter
{
    public static readonly ExportColumn[] Columns =
        [new("section", "Section"), new("row", "Row"), new("field", "Field"), new("value", "Value")];

    public static List<Dictionary<string, object?>> Project(PdfTemplate template, Dictionary<string, object?> data)
    {
        var rows = new List<Dictionary<string, object?>>();
        void Add(string section, int row, string field, object? value)
        {
            if (rows.Count >= 10000) throw new ArgumentException("Test exports support at most 10,000 content cells.");
            rows.Add(new() { ["section"] = section, ["row"] = row, ["field"] = field, ["value"] = value });
        }
        Add(template.Name, 0, "Report", template.Name);
        foreach (var item in template.Objects.Where(item => !item.Hidden))
        {
            switch (item)
            {
                case TextObject text:
                    Add(item.Name, 0, "Text", PlaceholderResolver.Resolve(text.Text, data));
                    break;
                case QrCodeObject qr:
                    Add(item.Name, 0, "QR payload", data.GetValueOrDefault(PlaceholderResolver.ExtractKey(qr.Variable)));
                    break;
                case BarcodeObject barcode:
                    Add(item.Name, 0, "Barcode payload", data.GetValueOrDefault(PlaceholderResolver.ExtractKey(barcode.Variable)));
                    break;
                case TableObject table:
                    var tableRows = PdfRenderService.ResolveRows(table.DataSource, data);
                    for (var index = 0; index < tableRows.Count; index++)
                        foreach (var column in table.Columns)
                            Add(item.Name, index + 1, column.Header, tableRows[index].GetValueOrDefault(column.Field));
                    break;
                case ChartObject chart:
                    var chartRows = PdfRenderService.ResolveRows(chart.DataSource, data, strict: true);
                    ChartSvgRenderer.BuildChartSvg(chart, chartRows);
                    Add(item.Name, 0, "Chart", chart.Title);
                    for (var index = 0; index < chartRows.Count; index++)
                    {
                        Add(item.Name, index + 1, chart.LabelField, chartRows[index].GetValueOrDefault(chart.LabelField));
                        foreach (var series in chart.Series)
                            Add(item.Name, index + 1, series.Label, chartRows[index].GetValueOrDefault(series.Field));
                    }
                    break;
            }
        }
        return rows;
    }

    public static object Generate(SavedTemplate saved, JsonElement sampleData, IReportRenderer renderer,
        CancellationToken cancellationToken)
    {
        if (sampleData.ValueKind != JsonValueKind.Object) throw new ArgumentException("Frontend sample data must be a JSON object.");
        var template = TemplateObjectParser.Parse(saved.Template.GetRawText());
        var data = (Dictionary<string, object?>)JsonDataNormalizer.NormalizeElement(sampleData)!;
        var rows = Project(template, data);
        var artifacts = new List<(string Format, string ContentType, byte[] Bytes)>();
        foreach (var format in new[] { "csv", "xlsx", "docx", "pdf" })
        {
            cancellationToken.ThrowIfCancellationRequested();
            artifacts.Add(format switch
            {
                "csv" => (format, "text/csv; charset=utf-8", TabularReportExporter.Csv(Columns, rows)),
                "xlsx" => (format, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", TabularReportExporter.Xlsx(Columns, rows)),
                "docx" => (format, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", TabularReportExporter.Docx(Columns, rows)),
                _ => (format, "application/pdf", renderer.Render(template, data))
            });
        }
        var dataSha256 = Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(sampleData.GetRawText()))).ToLowerInvariant();
        var generatedAtUtc = DateTimeOffset.UtcNow;
        using var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        {
            void Write(string name, byte[] bytes)
            {
                using var stream = archive.CreateEntry(name, CompressionLevel.Fastest).Open();
                stream.Write(bytes);
            }
            foreach (var artifact in artifacts) Write($"report.{artifact.Format}", artifact.Bytes);
            Write("template.json", JsonSerializer.SerializeToUtf8Bytes(saved.Template));
            Write("sample-data.json", System.Text.Encoding.UTF8.GetBytes(sampleData.GetRawText()));
            Write("manifest.json", JsonSerializer.SerializeToUtf8Bytes(new
            {
                templateId = saved.Id, templateName = saved.Name, templateSavedAtUtc = saved.SavedAtUtc,
                generatedAtUtc, dataSha256, contentCells = rows.Count,
                layout = "PDF preserves canvas layout; CSV, Excel and Word contain resolved report content and chart values.",
                files = artifacts.Select(artifact => new
                {
                    name = $"report.{artifact.Format}", contentType = artifact.ContentType,
                    sha256 = Convert.ToHexString(SHA256.HashData(artifact.Bytes)).ToLowerInvariant()
                })
            }));
        }
        artifacts.Add(("zip", "application/zip", output.ToArray()));
        return new
        {
            templateId = saved.Id, name = saved.Name, generatedAtUtc, dataSha256,
            files = artifacts.Select(artifact => new TemplateTestFile(artifact.Format, artifact.ContentType, Convert.ToBase64String(artifact.Bytes)))
        };
    }
}