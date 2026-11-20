using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using AutobankerReportsManager.Data;
using AutobankerReportsManager.Services;

namespace AutobankerReportsManager.Controllers;

[ApiController]
[Route("api/pdf")]
public class PdfController : ControllerBase
{
    private readonly IReportRenderer _renderService;
    private readonly IWebHostEnvironment _env;

    public PdfController(IReportRenderer renderService, IWebHostEnvironment env)
    {
        _renderService = renderService;
        _env = env;
    }

    /// <summary>
    /// GET /api/pdf/sample
    /// Loads Templates/testpdf.json + hardcoded SampleData and streams back a rendered PDF.
    /// This is the quickest way to confirm the pipeline works end to end.
    /// </summary>
    [HttpGet("sample")]
    public IActionResult GenerateSample()
    {
        var templatePath = Path.Combine(_env.ContentRootPath, "Templates", "testpdf.json");
        var json = System.IO.File.ReadAllText(templatePath);
        var data = SampleData.GetInvoiceTestData();
        return RenderTemplate(json, data, "sample-invoice.pdf");
    }

    /// <summary>
    /// POST /api/pdf/generate
    /// Accepts a template (same shape as testpdf.json) plus a flat data object, and
    /// returns the rendered PDF. This is the shape you'll call once real data replaces
    /// the in-memory sample - the template can also come from a saved file/DB instead
    /// of being posted every time, if you prefer (see GenerateByTemplateName below).
    /// </summary>
    [HttpPost("generate")]
    public IActionResult Generate([FromBody] GeneratePdfRequest request)
    {
        if (request.Template.ValueKind == JsonValueKind.Undefined)
            return BadRequest("`template` is required.");

        var data = request.Data is { ValueKind: JsonValueKind.Object }
            ? (Dictionary<string, object?>)JsonDataNormalizer.NormalizeElement(request.Data)!
            : new Dictionary<string, object?>();

        return RenderTemplate(request.Template.GetRawText(), data);
    }

    /// <summary>
    /// POST /api/pdf/generate/{templateName}
    /// Loads a template already saved under Templates/{templateName}.json and renders it
    /// with the posted data - closer to how you'll likely use this once templates are
    /// designed once and reused with different data each time.
    /// </summary>
    [HttpPost("generate/{templateName}")]
    public IActionResult GenerateByTemplateName(string templateName, [FromBody] JsonElement data)
    {
        var templatePath = Path.Combine(_env.ContentRootPath, "Templates", $"{templateName}.json");
        if (!System.IO.File.Exists(templatePath))
            return NotFound($"No template named '{templateName}' found.");

        var json = System.IO.File.ReadAllText(templatePath);
        var normalized = data.ValueKind == JsonValueKind.Object
            ? (Dictionary<string, object?>)JsonDataNormalizer.NormalizeElement(data)!
            : new Dictionary<string, object?>();

        return RenderTemplate(json, normalized, $"{templateName}.pdf");
    }

    private IActionResult RenderTemplate(string json, Dictionary<string, object?> data, string? downloadName = null)
    {
        try
        {
            var template = TemplateObjectParser.Parse(json);
            var pdfBytes = _renderService.Render(template, data);
            return File(pdfBytes, "application/pdf", downloadName ?? $"{template.Name}.pdf");
        }
        catch (Exception error) when (error is ArgumentException or JsonException)
        {
            return BadRequest(error.Message);
        }
    }
}

public class GeneratePdfRequest
{
    public JsonElement Template { get; set; }
    public JsonElement Data { get; set; }
}
