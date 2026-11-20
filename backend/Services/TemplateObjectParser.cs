using System.Text.Json;
using AutobankerReportsManager.Models;

namespace AutobankerReportsManager.Services;

public static class TemplateObjectParser
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    /// <summary>
    /// Loads a template from raw JSON text and materializes the polymorphic
    /// "objects" array into concrete PdfObjectBase subclasses.
    /// </summary>
    public static PdfTemplate Parse(string json)
    {
        var template = JsonSerializer.Deserialize<PdfTemplate>(json, JsonOptions)
                        ?? throw new InvalidOperationException("Template JSON could not be parsed.");

        foreach (var raw in template.ObjectsRaw)
        {
            if (!raw.TryGetProperty("type", out var typeProp))
                continue; // skip malformed entries rather than failing the whole document

            var type = typeProp.GetString();
            var rawText = raw.GetRawText();

            PdfObjectBase? obj = type switch
            {
                "rect" => JsonSerializer.Deserialize<RectObject>(rawText, JsonOptions),
                "circle" => JsonSerializer.Deserialize<CircleObject>(rawText, JsonOptions),
                "text" => JsonSerializer.Deserialize<TextObject>(rawText, JsonOptions),
                "line" => JsonSerializer.Deserialize<LineObject>(rawText, JsonOptions),
                "image" => JsonSerializer.Deserialize<ImageObject>(rawText, JsonOptions),
                "qrcode" => JsonSerializer.Deserialize<QrCodeObject>(rawText, JsonOptions),
                "barcode" => JsonSerializer.Deserialize<BarcodeObject>(rawText, JsonOptions),
                "table" => JsonSerializer.Deserialize<TableObject>(rawText, JsonOptions),
                "chart" => JsonSerializer.Deserialize<ChartObject>(rawText, JsonOptions),
                _ => null // unknown object type - ignored, doesn't break rendering
            };

            if (obj is ChartObject chart)
                ChartSvgRenderer.Validate(chart);

            if (obj != null)
                template.Objects.Add(obj);
        }

        return template;
    }
}
