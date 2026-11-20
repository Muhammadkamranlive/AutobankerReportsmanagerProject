using System.Text.Json;
using System.Text.Json.Serialization;

namespace AutobankerReportsManager.Models;

public class PdfTemplate
{
    [JsonPropertyName("version")] public string Version { get; set; } = "1.0";
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("page")] public PageSettings Page { get; set; } = new();
    [JsonPropertyName("watermark")] public WatermarkSettings? Watermark { get; set; }
    [JsonPropertyName("pagination")] public PaginationSettings? Pagination { get; set; }

    // Raw objects array - resolved into typed objects by TemplateObjectParser
    [JsonPropertyName("objects")] public List<JsonElement> ObjectsRaw { get; set; } = new();

    [JsonIgnore]
    public List<PdfObjectBase> Objects { get; set; } = new();
}

public class PageSettings
{
    [JsonPropertyName("size")] public string Size { get; set; } = "A4";
    [JsonPropertyName("orientation")] public string Orientation { get; set; } = "portrait";
    [JsonPropertyName("width")] public float Width { get; set; } = 595;
    [JsonPropertyName("height")] public float Height { get; set; } = 842;
    [JsonPropertyName("margins")] public Margins Margins { get; set; } = new();
}

public class Margins
{
    [JsonPropertyName("top")] public float Top { get; set; }
    [JsonPropertyName("right")] public float Right { get; set; }
    [JsonPropertyName("bottom")] public float Bottom { get; set; }
    [JsonPropertyName("left")] public float Left { get; set; }
}

public class WatermarkSettings
{
    [JsonPropertyName("enabled")] public bool Enabled { get; set; }
    [JsonPropertyName("text")] public string Text { get; set; } = "DRAFT";
    [JsonPropertyName("color")] public string Color { get; set; } = "#cc0000";
    [JsonPropertyName("opacity")] public float Opacity { get; set; } = 0.15f;
    [JsonPropertyName("fontSize")] public float FontSize { get; set; } = 96;
    [JsonPropertyName("rotation")] public float Rotation { get; set; } = -35;
}

public class PaginationSettings
{
    [JsonPropertyName("enabled")] public bool Enabled { get; set; }
    [JsonPropertyName("format")] public string Format { get; set; } = "Page {{page}} of {{pages}}";
    [JsonPropertyName("align")] public string Align { get; set; } = "center";
}

/// <summary>
/// Common fields shared by every object type on the canvas.
/// </summary>
public abstract class PdfObjectBase
{
    public string Id { get; set; } = "";
    public string Type { get; set; } = "";
    public string Name { get; set; } = "";
    public float X { get; set; }
    public float Y { get; set; }
    public float Width { get; set; }
    public float Height { get; set; }
    public float Rotation { get; set; }
    public bool Locked { get; set; }
    public bool Hidden { get; set; }
    public string Region { get; set; } = "body";
}

public class RectObject : PdfObjectBase
{
    public string? Fill { get; set; }
    public string? Stroke { get; set; }
    public float StrokeWidth { get; set; }
    public float Rx { get; set; }
}

public class CircleObject : PdfObjectBase
{
    public string? Fill { get; set; }
    public string? Stroke { get; set; }
    public float StrokeWidth { get; set; }
}

public class TextObject : PdfObjectBase
{
    public string Text { get; set; } = "";
    public string FontFamily { get; set; } = "Helvetica";
    public float FontSize { get; set; } = 11;
    public string FontWeight { get; set; } = "normal";
    public string FontStyle { get; set; } = "normal";
    public bool Underline { get; set; }
    public string Color { get; set; } = "#000000";
    public string? BackgroundColor { get; set; }
    public string Align { get; set; } = "left";
    public float LetterSpacing { get; set; }
}

public class LineObject : PdfObjectBase
{
    public string Stroke { get; set; } = "#000000";
    public float StrokeWidth { get; set; } = 1;
}

public class ImageObject : PdfObjectBase
{
    public string Src { get; set; } = "";
    public string Fit { get; set; } = "contain";
}

public class QrCodeObject : PdfObjectBase
{
    public string Variable { get; set; } = "";
    public string Foreground { get; set; } = "#000000";
    public string Background { get; set; } = "#ffffff";
}

public class BarcodeObject : PdfObjectBase
{
    public string Variable { get; set; } = "";
    public string Format { get; set; } = "CODE128";
    public string Foreground { get; set; } = "#000000";
    public string Background { get; set; } = "#ffffff";
}

public class TableColumn
{
    public string Id { get; set; } = "";
    public string Header { get; set; } = "";
    public string Field { get; set; } = "";
    public float Width { get; set; } = 100;
    public string Align { get; set; } = "left";
}

public class ChartSeries
{
    public string Field { get; set; } = "";
    public string Label { get; set; } = "";
    public string Color { get; set; } = "";
}

public class ChartObject : PdfObjectBase
{
    public string ChartType { get; set; } = "";
    public string Title { get; set; } = "";
    public string DataSource { get; set; } = "";
    public string LabelField { get; set; } = "";
    public List<ChartSeries> Series { get; set; } = new();
}

public class TableObject : PdfObjectBase
{
    public List<TableColumn> Columns { get; set; } = new();
    public float RowHeight { get; set; } = 24;
    public float HeaderHeight { get; set; } = 28;
    public string HeaderBg { get; set; } = "#111827";
    public string HeaderColor { get; set; } = "#ffffff";
    public string BorderColor { get; set; } = "#d1d5db";
    public float FontSize { get; set; } = 11;
    public string DataSource { get; set; } = "";
}
