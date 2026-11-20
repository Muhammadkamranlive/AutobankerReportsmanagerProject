using AutobankerReportsManager.Models;
using QRCoder;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using ZXing;
using ZXing.Common;

namespace AutobankerReportsManager.Services;

public class PdfRenderService : IReportRenderer
{
    static PdfRenderService()
    {
        // Community license is free for small businesses/individuals - see questpdf.com/license.
        // Swap to LicenseType.Professional/Enterprise if that applies to you.
        QuestPDF.Settings.License = LicenseType.Community;
    }

    public byte[] Render(PdfTemplate template, Dictionary<string, object?> data)
    {
        var document = QuestPDF.Fluent.Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(new PageSize(template.Page.Width, template.Page.Height));

                // Margins are template metadata, not enforced here: several objects (e.g. the
                // logo at y=8, the QR code at y=10) are deliberately positioned above/outside the
                // declared margin. Every object is placed by its own absolute x/y instead.
                page.Margin(0);

                page.Content().Layers(layers =>
                {
                    // Primary layer just establishes the page's content area size.
                    layers.PrimaryLayer().Background(Colors.White);

                    if (template.Watermark?.Enabled == true)
                        layers.Layer().Element(c => RenderWatermark(c, template.Watermark));

                    foreach (var obj in template.Objects)
                    {
                        if (obj.Hidden) continue;

                        layers.Layer()
                            .TranslateX(obj.X)
                            .TranslateY(obj.Y)
                            .Width(obj.Width)
                            .Height(obj.Height)
                            .Element(c => RenderObject(c, obj, data));
                    }
                });
            });
        });

        return document.GeneratePdf();
    }

    public byte[] RenderDataset(QueryResult result)
    {
        if (result.Columns.Count is < 1 or > 12)
            throw new ArgumentException("Select between 1 and 12 fields for PDF, or use Excel/CSV.");
        var document = Document.Create(container => container.Page(page =>
        {
            page.Size(result.Columns.Count > 5 ? PageSizes.A4.Landscape() : PageSizes.A4);
            page.Margin(24);
            page.DefaultTextStyle(style => style.FontSize(9));
            page.Header().PaddingBottom(12).Text("Dataset report").FontSize(16).Bold();
            page.Content().Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    foreach (var column in result.Columns) columns.RelativeColumn();
                });
                table.Header(header =>
                {
                    foreach (var column in result.Columns)
                        header.Cell().Background("#175B43").Padding(6).Text(column.Header).FontColor(Colors.White).Bold();
                });
                foreach (var row in result.Rows)
                    foreach (var column in result.Columns)
                    {
                        row.TryGetValue(column.Field, out var value);
                        table.Cell().BorderBottom(0.5f).BorderColor("#D8DED9").Padding(6)
                            .Text(Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture) ?? "");
                    }
            });
            page.Footer().PaddingTop(10).AlignCenter().Text(text =>
            {
                text.Span("Page ");
                text.CurrentPageNumber();
                text.Span(" of ");
                text.TotalPages();
            });
        }));
        return document.GeneratePdf();
    }

    private void RenderObject(IContainer container, PdfObjectBase obj, Dictionary<string, object?> data)
    {
        var target = obj.Rotation != 0 ? container.Rotate(obj.Rotation) : container;

        switch (obj)
        {
            case RectObject rect: RenderRect(target, rect); break;
            case CircleObject circle: RenderCircle(target, circle); break;
            case TextObject text: RenderText(target, text, data); break;
            case LineObject line: RenderLine(target, line); break;
            case ImageObject image: RenderImage(target, image); break;
            case QrCodeObject qr: RenderQrCode(target, qr, data); break;
            case BarcodeObject barcode: RenderBarcode(target, barcode, data); break;
            case TableObject table: RenderTable(target, table, data); break;
            case ChartObject chart: RenderChart(target, chart, data); break;
        }
    }

    private static void RenderChart(IContainer container, ChartObject chart, Dictionary<string, object?> data)
    {
        string svg;
        try
        {
            ChartSvgRenderer.Validate(chart);
            svg = ChartSvgRenderer.BuildChartSvg(chart, ResolveRows(chart.DataSource, data, strict: true));
        }
        catch (ArgumentException error)
        {
            svg = ChartSvgRenderer.BuildErrorSvg(chart, error.Message);
        }
        container.Svg(svg).FitArea();
    }

    // QuestPDF's Canvas/SkiaSharp API was deprecated in 2024.3.0 in favor of .Svg(...).
    // Rect and line are simple enough to express directly as inline SVG markup - no
    // SkiaSharp package reference needed at all.
    private static void RenderRect(IContainer container, RectObject rect)
    {
        container.Svg(size =>
        {
            var fill = !string.IsNullOrEmpty(rect.Fill) ? rect.Fill : "none";
            var strokeAttr = !string.IsNullOrEmpty(rect.Stroke) && rect.StrokeWidth > 0
                ? $"stroke=\"{rect.Stroke}\" stroke-width=\"{rect.StrokeWidth}\""
                : "stroke=\"none\"";
            var inset = rect.StrokeWidth / 2f;
            var w = Math.Max(0, size.Width - rect.StrokeWidth);
            var h = Math.Max(0, size.Height - rect.StrokeWidth);

            return $"""
                <svg width="{size.Width}" height="{size.Height}" xmlns="http://www.w3.org/2000/svg">
                    <rect x="{inset}" y="{inset}" width="{w}" height="{h}"
                          rx="{rect.Rx}" ry="{rect.Rx}" fill="{fill}" {strokeAttr} />
                </svg>
                """;
        });
    }

    private static void RenderLine(IContainer container, LineObject line)
    {
        container.Svg(size => $"""
            <svg width="{size.Width}" height="{size.Height}" xmlns="http://www.w3.org/2000/svg">
                <line x1="0" y1="{size.Height / 2f}" x2="{size.Width}" y2="{size.Height / 2f}"
                      stroke="{line.Stroke}" stroke-width="{line.StrokeWidth}" />
            </svg>
            """);
    }

    private static void RenderCircle(IContainer container, CircleObject circle)
    {
        container.Svg(size =>
        {
            var fill = !string.IsNullOrEmpty(circle.Fill) ? circle.Fill : "none";
            var stroke = !string.IsNullOrEmpty(circle.Stroke) && circle.StrokeWidth > 0
                ? $"stroke=\"{System.Security.SecurityElement.Escape(circle.Stroke)}\" stroke-width=\"{circle.StrokeWidth}\""
                : "stroke=\"none\"";
            var radiusX = Math.Max(0, (size.Width - circle.StrokeWidth) / 2f);
            var radiusY = Math.Max(0, (size.Height - circle.StrokeWidth) / 2f);

            return $"""
                <svg width="{size.Width}" height="{size.Height}" xmlns="http://www.w3.org/2000/svg">
                    <ellipse cx="{size.Width / 2f}" cy="{size.Height / 2f}" rx="{radiusX}" ry="{radiusY}"
                             fill="{System.Security.SecurityElement.Escape(fill)}" {stroke} />
                </svg>
                """;
        });
    }

    private static void RenderImage(IContainer container, ImageObject image)
    {
        var bytes = DecodeImageDataUrl(image.Src);
        var descriptor = container.Image(bytes);

        if (string.Equals(image.Fit, "stretch", StringComparison.OrdinalIgnoreCase))
            descriptor.FitUnproportionally();
        else
            descriptor.FitArea();
    }

    private static void RenderText(IContainer container, TextObject textObj, Dictionary<string, object?> data)
    {
        var resolved = PlaceholderResolver.Resolve(textObj.Text, data);

        var aligned = textObj.Align switch
        {
            "center" => container.AlignCenter(),
            "right" => container.AlignRight(),
            _ => container.AlignLeft()
        };

        if (!string.IsNullOrEmpty(textObj.BackgroundColor))
            aligned = aligned.Background(ParseColor(textObj.BackgroundColor));

        aligned.Text(t =>
        {
            t.DefaultTextStyle(style =>
            {
                style = style
                    .FontFamily(textObj.FontFamily)
                    .FontSize(textObj.FontSize)
                    .FontColor(ParseColor(textObj.Color));

                if (string.Equals(textObj.FontWeight, "bold", StringComparison.OrdinalIgnoreCase))
                    style = style.Bold();
                if (string.Equals(textObj.FontStyle, "italic", StringComparison.OrdinalIgnoreCase))
                    style = style.Italic();
                if (textObj.Underline)
                    style = style.Underline();
                if (textObj.LetterSpacing != 0)
                    style = style.LetterSpacing(textObj.LetterSpacing);

                return style;
            });

            // {{page}} / {{pages}} need QuestPDF's dynamic spans since the value
            // isn't known until the whole document has been laid out.
            foreach (var (isPageToken, value) in PlaceholderResolver.SplitOnPageTokens(resolved))
            {
                if (!isPageToken) { t.Span(value); continue; }
                if (value == "page") t.CurrentPageNumber();
                else t.TotalPages();
            }
        });
    }

    private static void RenderQrCode(IContainer container, QrCodeObject qr, Dictionary<string, object?> data)
    {
        var key = PlaceholderResolver.ExtractKey(qr.Variable);
        var payload = data.TryGetValue(key, out var v) ? Convert.ToString(v) : null;
        if (string.IsNullOrWhiteSpace(payload))
            payload = qr.Variable; // fall back to showing the raw token so a missing value is obvious

        using var generator = new QRCodeGenerator();
        using var qrData = generator.CreateQrCode(payload, QRCodeGenerator.ECCLevel.Q);
        var pngQr = new PngByteQRCode(qrData);
        var bytes = pngQr.GetGraphic(
            pixelsPerModule: 20,
            darkColorRgba: HexToRgba(qr.Foreground),
            lightColorRgba: HexToRgba(qr.Background));

        container.Image(bytes).FitArea();
    }

    private static void RenderBarcode(IContainer container, BarcodeObject barcode, Dictionary<string, object?> data)
    {
        var key = PlaceholderResolver.ExtractKey(barcode.Variable);
        var payload = data.TryGetValue(key, out var value) ? Convert.ToString(value) : null;
        if (string.IsNullOrWhiteSpace(payload))
            payload = barcode.Variable;
        if (string.IsNullOrWhiteSpace(payload))
            payload = "0000000000";

        var format = barcode.Format.ToUpperInvariant() switch
        {
            "EAN13" => BarcodeFormat.EAN_13,
            "UPC" => BarcodeFormat.UPC_A,
            _ => BarcodeFormat.CODE_128
        };

        BitMatrix matrix;
        try
        {
            matrix = new MultiFormatWriter().encode(payload, format, 0, 0);
        }
        catch (ArgumentException) when (format != BarcodeFormat.CODE_128)
        {
            matrix = new MultiFormatWriter().encode(payload, BarcodeFormat.CODE_128, 0, 0);
        }

        var foreground = System.Security.SecurityElement.Escape(barcode.Foreground);
        var background = System.Security.SecurityElement.Escape(barcode.Background);
        var readableText = System.Security.SecurityElement.Escape(payload);

        container.Svg(size =>
        {
            var barsHeight = Math.Max(1, size.Height - 14);
            var svg = new System.Text.StringBuilder();
            svg.Append($"<svg width=\"{size.Width}\" height=\"{size.Height}\" viewBox=\"0 0 {matrix.Width} {size.Height}\" preserveAspectRatio=\"none\" xmlns=\"http://www.w3.org/2000/svg\">");
            svg.Append($"<rect width=\"100%\" height=\"100%\" fill=\"{background}\"/>");

            for (var x = 0; x < matrix.Width;)
            {
                if (!matrix[x, 0])
                {
                    x++;
                    continue;
                }

                var start = x;
                while (x < matrix.Width && matrix[x, 0])
                    x++;
                svg.Append($"<rect x=\"{start}\" y=\"0\" width=\"{x - start}\" height=\"{barsHeight}\" fill=\"{foreground}\"/>");
            }

            svg.Append($"<text x=\"{matrix.Width / 2f}\" y=\"{size.Height - 2}\" text-anchor=\"middle\" font-family=\"sans-serif\" font-size=\"10\" fill=\"{foreground}\">{readableText}</text></svg>");
            return svg.ToString();
        });
    }

    private static byte[] DecodeImageDataUrl(string source)
    {
        const int maxImageBytes = 12 * 1024 * 1024;
        var separator = source.IndexOf(',');
        if (separator <= 0)
            throw new InvalidOperationException("Images must be embedded as a base64 data URL.");

        var metadata = source[..separator];
        var mimeType = metadata.Split(';', 2)[0];
        if (!metadata.EndsWith(";base64", StringComparison.OrdinalIgnoreCase) ||
            mimeType is not ("data:image/png" or "data:image/jpeg" or "data:image/webp"))
            throw new InvalidOperationException("Only embedded PNG, JPEG, and WebP images are supported.");

        var encoded = source[(separator + 1)..];
        if (encoded.Length > ((maxImageBytes + 2) / 3 * 4))
            throw new InvalidOperationException("Image exceeds the 12 MB limit.");

        var bytes = Convert.FromBase64String(encoded);
        if (bytes.Length > maxImageBytes)
            throw new InvalidOperationException("Image exceeds the 12 MB limit.");

        return bytes;
    }

    private static void RenderTable(IContainer container, TableObject tbl, Dictionary<string, object?> data)
    {
        var rows = ResolveRows(tbl.DataSource, data);

        container.Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                foreach (var col in tbl.Columns)
                    columns.ConstantColumn(col.Width);
            });

            // Vertical padding approximates the requested rowHeight/headerHeight around the font size.
            var headerPadding = Math.Max(2, (tbl.HeaderHeight - tbl.FontSize) / 2f);
            var rowPadding = Math.Max(2, (tbl.RowHeight - tbl.FontSize) / 2f);

            table.Header(header =>
            {
                foreach (var col in tbl.Columns)
                {
                    header.Cell()
                        .Background(ParseColor(tbl.HeaderBg))
                        .PaddingVertical(headerPadding)
                        .PaddingHorizontal(6)
                        .AlignedFor(col.Align)
                        .Text(col.Header)
                        .FontColor(ParseColor(tbl.HeaderColor))
                        .FontSize(tbl.FontSize)
                        .Bold();
                }
            });

            foreach (var row in rows)
            {
                foreach (var col in tbl.Columns)
                {
                    var value = row.TryGetValue(col.Field, out var cell) ? Convert.ToString(cell) ?? "" : "";
                    table.Cell()
                        .BorderBottom(1)
                        .BorderColor(ParseColor(tbl.BorderColor))
                        .PaddingVertical(rowPadding)
                        .PaddingHorizontal(6)
                        .AlignedFor(col.Align)
                        .Text(value)
                        .FontSize(tbl.FontSize);
                }
            }
        });
    }

    // Full-page rotated, semi-transparent text - expressed as SVG since Canvas is deprecated.
    private static void RenderWatermark(IContainer container, WatermarkSettings watermark)
    {
        container.Svg(size =>
        {
            var cx = size.Width / 2f;
            var cy = size.Height / 2f;

            return $"""
                <svg width="{size.Width}" height="{size.Height}" xmlns="http://www.w3.org/2000/svg">
                    <text x="{cx}" y="{cy}" font-size="{watermark.FontSize}" font-weight="bold"
                          fill="{watermark.Color}" fill-opacity="{watermark.Opacity}"
                          text-anchor="middle" dominant-baseline="middle"
                          transform="rotate({watermark.Rotation} {cx} {cy})">{System.Security.SecurityElement.Escape(watermark.Text)}</text>
                </svg>
                """;
        });
    }

    public static List<Dictionary<string, object?>> ResolveRows(string dataSource, Dictionary<string, object?> data, bool strict = false)
    {
        var key = PlaceholderResolver.ExtractKey(dataSource);
        if (strict)
        {
            object? source = data;
            foreach (var segment in key.Split('.'))
            {
                if (source is not Dictionary<string, object?> parent || !parent.TryGetValue(segment, out source))
                    throw new ArgumentException("Data source is not a collection");
            }
            if (source is not IEnumerable<object?> collection)
                throw new ArgumentException("Data source is not a collection");
            var chartRows = new List<Dictionary<string, object?>>();
            foreach (var item in collection)
            {
                if (chartRows.Count == 20) throw new ArgumentException("Limit exceeded: 20 categories");
                if (item is not Dictionary<string, object?> row) throw new ArgumentException("Missing category labels");
                chartRows.Add(row);
            }
            return chartRows;
        }
        if (!data.TryGetValue(key, out var raw) || raw is null)
            return new List<Dictionary<string, object?>>();

        var result = new List<Dictionary<string, object?>>();

        if (raw is IEnumerable<Dictionary<string, object?>> typedRows)
        {
            result.AddRange(typedRows);
        }
        else if (raw is IEnumerable<object?> looseRows)
        {
            foreach (var item in looseRows)
            {
                if (item is Dictionary<string, object?> dict)
                    result.Add(dict);
            }
        }

        return result;
    }

    // QuestPDF's own Color type (QuestPDF.Infrastructure.Color), not SkiaSharp's SKColor.
    private static Color ParseColor(string? hex)
    {
        if (string.IsNullOrWhiteSpace(hex)) return Colors.Black;
        try
        {
            return Color.FromHex(hex);
        }
        catch
        {
            return Colors.Black;
        }
    }

    // Manual hex -> RGBA parsing, avoiding any dependency on SkiaSharp or System.Drawing.
    private static byte[] HexToRgba(string hex)
    {
        var h = hex.TrimStart('#');
        if (h.Length == 3)
            h = string.Concat(h.Select(c => new string(c, 2)));

        byte r = 0, g = 0, b = 0, a = 255;
        try
        {
            r = Convert.ToByte(h.Substring(0, 2), 16);
            g = Convert.ToByte(h.Substring(2, 2), 16);
            b = Convert.ToByte(h.Substring(4, 2), 16);
            if (h.Length >= 8)
                a = Convert.ToByte(h.Substring(6, 2), 16);
        }
        catch
        {
            // fall back to opaque black on malformed input
        }

        return new byte[] { r, g, b, a };
    }
}

internal static class ContainerAlignmentExtensions
{
    public static IContainer AlignedFor(this IContainer container, string? align) => align switch
    {
        "center" => container.AlignCenter(),
        "right" => container.AlignRight(),
        _ => container.AlignLeft()
    };
}
