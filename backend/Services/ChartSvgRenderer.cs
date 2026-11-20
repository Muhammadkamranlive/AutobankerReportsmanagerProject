using System.Globalization;
using System.Security;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;
using AutobankerReportsManager.Models;

namespace AutobankerReportsManager.Services;

public static class ChartSvgRenderer
{
    private static readonly string[] Palette = ["#16845b", "#087f8c", "#e16b58", "#367ac4", "#b58a14", "#7b62a3", "#3c9c89", "#c05472", "#53764b", "#547f9f", "#9c6e28", "#8e657b"];

    public static void Validate(ChartObject chart)
    {
        ArgumentNullException.ThrowIfNull(chart);
        if (chart.ChartType is not ("bar" or "line" or "donut") || chart.Title is null || chart.Title.Length > 80
            || !Bounded(chart.DataSource, 128) || !Bounded(chart.LabelField, 128))
            throw new ArgumentException("Invalid chart type, title or binding.");
        if (chart.Series is null || chart.Series.Count is < 1 or > 4 || (chart.ChartType == "donut" && chart.Series.Count != 1))
            throw new ArgumentException("Charts need 1-4 series; donuts need exactly one.");
        VerifyText(chart.Title);
        foreach (var series in chart.Series)
        {
            if (series is null || !Bounded(series.Field, 128) || !Bounded(series.Label, 32)
                || series.Color is null || !Regex.IsMatch(series.Color, "\\A#[0-9a-fA-F]{6}\\z"))
                throw new ArgumentException("Invalid chart series field, label or hex color.");
            VerifyText(series.Label);
        }
    }

    public static string BuildChartSvg(ChartObject chart, IEnumerable<Dictionary<string, object?>>? rows)
    {
        Validate(chart);
        if (rows is null) throw new ArgumentException("Data source is not a collection");
        var categories = new List<string>();
        var values = new List<double[]>();
        foreach (var row in rows)
        {
            if (values.Count == 20) throw new ArgumentException("Limit exceeded: 20 categories");
            if (row is null || !row.TryGetValue(chart.LabelField, out var label))
                throw new ArgumentException("Missing category labels");
            var category = label is string text ? text : Number(label).ToString("G", CultureInfo.InvariantCulture);
            VerifyText(category);
            categories.Add(category);
            values.Add(chart.Series.Select(series =>
            {
                if (!row.TryGetValue(series.Field, out var raw)) throw new ArgumentException("Series values must be finite numbers");
                var value = Number(raw);
                if (chart.ChartType == "donut" && value < 0) throw new ArgumentException("Donut values must be nonnegative");
                return value;
            }).ToArray());
        }
        if (values.Count == 0) throw new ArgumentException("No data");
        var (width, height) = Bounds(chart);
        var parts = new StringBuilder(Text(Short(chart.Title, (int)Math.Floor(width / 7)), 12, 21, 13));
        if (chart.ChartType == "donut")
        {
            var total = values.Sum(row => row[0]);
            if (!double.IsFinite(total)) throw new ArgumentException("Values exceed numeric range");
            if (total == 0) throw new ArgumentException("No nonzero data");
            var radius = Math.Min((height - 65) / 2, width * .22);
            var centerX = width * .27;
            var centerY = (height + 30) / 2;
            var offset = 0d;
            for (var index = 0; index < values.Count; index++)
            {
                var fraction = values[index][0] / total;
                var color = index == 0 ? chart.Series[0].Color : Palette[index % Palette.Length];
                parts.Append(Invariant($"<circle cx=\"{centerX}\" cy=\"{centerY}\" r=\"{radius * .73}\" fill=\"none\" stroke=\"{color}\" stroke-width=\"{radius * .42}\" stroke-dasharray=\"{fraction * Math.PI * radius * 1.46} {Math.PI * radius * 1.46}\" transform=\"rotate({offset * 360 - 90} {centerX} {centerY})\"/>"));
                var left = width * .53 + index % 2 * width * .23;
                var top = 56 + Math.Floor(index / 2d) * Math.Min(20, (height - 65) / Math.Ceiling(values.Count / 2d));
                parts.Append(Invariant($"<rect x=\"{left}\" y=\"{top - 8}\" width=\"7\" height=\"7\" fill=\"{color}\"/>"));
                parts.Append(Text($"{Short(categories[index], 8)} {Math.Round(fraction * 100, MidpointRounding.AwayFromZero).ToString(CultureInfo.InvariantCulture)}%", left + 10, top, 9));
                offset += fraction;
            }
            parts.Append(Text(Compact(total), centerX, centerY + 4, 14, "middle"));
        }
        else
        {
            const double left = 51, top = 41;
            var right = width - 12;
            var bottom = height - 58;
            var minimum = Math.Min(0, values.Min(row => row.Min()));
            var maximum = Math.Max(0, values.Max(row => row.Max()));
            var range = maximum - minimum;
            if (range == 0) range = 1;
            if (!double.IsFinite(range)) throw new ArgumentException("Values exceed numeric range");
            double Ordinate(double value) => bottom - (value - minimum) / range * (bottom - top);
            var baseline = Ordinate(0);
            var step = (right - left) / values.Count;
            for (var tick = 0; tick <= 4; tick++)
            {
                var value = minimum + range * (tick / 4d);
                var position = Ordinate(value);
                parts.Append(Invariant($"<path d=\"M{left} {position}H{right}\" stroke=\"#e1e7e4\"/>"));
                parts.Append(Text(Compact(value), left - 6, position + 3, 9, "end"));
            }
            parts.Append(Invariant($"<path data-baseline=\"true\" d=\"M{left} {baseline}H{right}\" stroke=\"#64746c\"/>"));
            for (var index = 0; index < values.Count; index++)
                parts.Append(Text(Short(categories[index], Math.Max(3, (int)Math.Floor(step / 5.2))), left + step * (index + .5), bottom + 16, 9, "middle"));
            for (var seriesIndex = 0; seriesIndex < chart.Series.Count; seriesIndex++)
            {
                var series = chart.Series[seriesIndex];
                if (chart.ChartType == "line")
                {
                    var points = string.Join(" ", values.Select((row, index) => Invariant($"{left + step * (index + .5)},{Ordinate(row[seriesIndex])}")));
                    parts.Append($"<polyline points=\"{points}\" fill=\"none\" stroke=\"{series.Color}\" stroke-width=\"2\"/>");
                    for (var index = 0; index < values.Count; index++)
                        parts.Append(Invariant($"<circle cx=\"{left + step * (index + .5)}\" cy=\"{Ordinate(values[index][seriesIndex])}\" r=\"2.5\" fill=\"{series.Color}\"/>"));
                }
                else
                {
                    var barWidth = step * .76 / chart.Series.Count;
                    for (var index = 0; index < values.Count; index++)
                    {
                        var value = values[index][seriesIndex];
                        parts.Append(Invariant($"<rect data-value=\"{value}\" x=\"{left + step * index + step * .12 + seriesIndex * barWidth}\" y=\"{Math.Min(baseline, Ordinate(value))}\" width=\"{barWidth * .88}\" height=\"{Math.Abs(Ordinate(value) - baseline)}\" fill=\"{series.Color}\"/>"));
                    }
                }
                var legendWidth = (width - 24) / chart.Series.Count;
                var legendLeft = 12 + legendWidth * seriesIndex;
                parts.Append(Invariant($"<rect x=\"{legendLeft}\" y=\"{height - 17}\" width=\"8\" height=\"8\" fill=\"{series.Color}\"/>"));
                parts.Append(Text(Short(series.Label, (int)Math.Floor((legendWidth - 16) / 5.5)), legendLeft + 13, height - 9, 9));
            }
        }
        return Wrap(width, height, parts.ToString());
    }

    public static string BuildErrorSvg(ChartObject chart, string message)
    {
        var (width, height) = Bounds(chart);
        var title = chart.Title ?? "Chart";
        try { VerifyText(title); } catch (ArgumentException) { title = "Chart"; }
        return Wrap(width, height, Text(Short(title, (int)Math.Floor(width / 7)), 12, 21, 13)
            + Text(Short(message, (int)Math.Floor(width / 6)), width / 2, height / 2, 11, "middle"));
    }

    private static (double Width, double Height) Bounds(ChartObject chart) =>
        (Math.Max(240, float.IsFinite(chart.Width) ? chart.Width : 460), Math.Max(180, float.IsFinite(chart.Height) ? chart.Height : 240));
    private static bool Bounded(string? value, int limit) => !string.IsNullOrWhiteSpace(value) && value.Length <= limit;
    private static string Invariant(FormattableString value) => value.ToString(CultureInfo.InvariantCulture);
    private static string Short(string value, int limit)
    {
        if (value.Length <= limit) return value;
        var length = Math.Max(0, limit - 3);
        if (length > 0 && char.IsHighSurrogate(value[length - 1])) length--;
        return value[..length] + "...";
    }
    private static void VerifyText(string value)
    {
        try { XmlConvert.VerifyXmlChars(value); }
        catch (XmlException) { throw new ArgumentException("Chart text contains invalid XML characters"); }
    }
    private static double Number(object? value)
    {
        var number = value switch
        {
            byte or sbyte or short or ushort or int or uint or long or ulong or float or double or decimal => Convert.ToDouble(value, CultureInfo.InvariantCulture),
            _ => throw new ArgumentException("Series values and numeric labels must be finite numbers")
        };
        if (!double.IsFinite(number)) throw new ArgumentException("Series values and numeric labels must be finite numbers");
        return number;
    }
    private static string Compact(double value)
    {
        var magnitude = Math.Abs(value);
        var divisor = magnitude >= 1e12 ? 1e12 : magnitude >= 1e9 ? 1e9 : magnitude >= 1e6 ? 1e6 : magnitude >= 1e3 ? 1e3 : 1;
        var rounded = Math.Round(value / divisor, 1, MidpointRounding.AwayFromZero);
        if (Math.Abs(rounded) >= 1000 && divisor < 1e12) { divisor *= 1000; rounded = Math.Round(value / divisor, 1, MidpointRounding.AwayFromZero); }
        var suffix = divisor == 1e12 ? "T" : divisor == 1e9 ? "B" : divisor == 1e6 ? "M" : divisor == 1e3 ? "K" : "";
        return rounded.ToString("0.#", CultureInfo.InvariantCulture) + suffix;
    }
    private static string Text(string value, double left, double top, int size = 10, string anchor = "start") =>
        Invariant($"<text x=\"{left}\" y=\"{top}\" font-size=\"{size}\" text-anchor=\"{anchor}\" fill=\"#36443f\">{SecurityElement.Escape(value)}</text>");
    private static string Wrap(double width, double height, string content) =>
        Invariant($"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{width}\" height=\"{height}\" viewBox=\"0 0 {width} {height}\" font-family=\"Helvetica,Arial,sans-serif\"><rect width=\"100%\" height=\"100%\" fill=\"#ffffff\"/>{content}</svg>");
}