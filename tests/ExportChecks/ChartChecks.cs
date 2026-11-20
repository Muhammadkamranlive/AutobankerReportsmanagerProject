using System.Globalization;
using System.Xml.Linq;
using AutobankerReportsManager.Models;
using AutobankerReportsManager.Services;

internal static class ChartChecks
{
    public static void Run()
    {
        var chart = new ChartObject { ChartType = "bar", Title = "Revenue", DataSource = "Rows", LabelField = "name", Width = 460, Height = 240,
            Series = [new() { Field = "amount", Label = "Amount", Color = "#16845b" }, new() { Field = "other", Label = "Other", Color = "#087f8c" }] };
        List<Dictionary<string, object?>> rows = [new() { ["name"] = "A", ["amount"] = 10m, ["other"] = -10 }, new() { ["name"] = "B", ["amount"] = -5d, ["other"] = 5L }];
        XDocument Svg() => XDocument.Parse(ChartSvgRenderer.BuildChartSvg(chart, rows));
        IEnumerable<XElement> Elements(XDocument svg, string name) => svg.Descendants().Where(element => element.Name.LocalName == name);
        double Attribute(XElement element, string name) => double.Parse(element.Attribute(name)!.Value, CultureInfo.InvariantCulture);
        var bars = Elements(Svg(), "rect").Where(element => element.Attribute("data-value") != null).ToArray();
        Check(bars.Length == 4 && Near(Attribute(bars[0], "y"), 41) && Near(Attribute(bars[0], "height"), 70.5)
            && Near(Attribute(bars[1], "y"), 111.5) && Near(Attribute(bars[1], "height"), 35.25), "signed bars share zero baseline");
        Check(Near(Attribute(bars[0], "x"), 74.82) && Near(Attribute(bars[2], "x"), 150.25)
            && Near(Attribute(bars[0], "width"), 66.3784), "grouped bar positions and widths");
        Check(Elements(Svg(), "path").Count() == 6 && Elements(Svg(), "path").Single(element => element.Attribute("data-baseline") != null).Attribute("d")!.Value == "M51 111.5H448", "grid and baseline geometry");
        chart.ChartType = "line";
        Check(Elements(Svg(), "polyline").First().Attribute("points")!.Value == "150.25,41 348.75,146.75"
            && Elements(Svg(), "circle").Count() == 4, "line points and dots");
        chart.ChartType = "donut";
        chart.Series.RemoveAt(1);
        rows[0]["amount"] = 1m;
        rows[1]["amount"] = 3d;
        var circles = Elements(Svg(), "circle").ToArray();
        Check(circles.Length == 2 && circles[0].Attribute("transform")!.Value.StartsWith("rotate(-90 ")
            && circles[1].Attribute("transform")!.Value.StartsWith("rotate(0 ")
            && Near(Attribute(circles[0], "r"), 63.875), "donut radius and prefix cumulative rotations");
        var dash = circles[0].Attribute("stroke-dasharray")!.Value.Split(' ').Select(value => double.Parse(value, CultureInfo.InvariantCulture)).ToArray();
        Check(Near(dash[0] / dash[1], .25), "donut arc fractions");
        rows.Add(new() { ["name"] = "C", ["amount"] = 4 });
        circles = Elements(Svg(), "circle").ToArray();
        Check(circles[2].Attribute("transform")!.Value.StartsWith("rotate(90 "), "third donut arc uses cumulative prefix rather than current fraction");
        rows.RemoveAt(2);
        rows[0]["amount"] = 0;
        rows[1]["amount"] = 0;
        Invalid(() => Svg(), "zero donut");
        rows[0]["amount"] = -1;
        Invalid(() => Svg(), "negative donut");
        chart.ChartType = "bar";
        chart.Width = 100;
        chart.Height = 90;
        Check(Svg().Root!.Attribute("viewBox")!.Value == "0 0 240 180", "minimum SVG bounds");
        chart.Width = float.NaN;
        chart.Height = float.PositiveInfinity;
        Check(Svg().Root!.Attribute("viewBox")!.Value == "0 0 460 240", "nonfinite bounds fallback");
        chart.Title = "<&\"' >";
        chart.Series[0].Label = "<&\"' >";
        rows[0]["name"] = "<&\"' >";
        rows[0]["amount"] = 1.25m;
        var originalCulture = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("fr-FR");
            var svg = Svg();
            Check(Elements(svg, "text").Count(element => element.Value == chart.Title) == 3
                && Elements(svg, "rect").Any(element => element.Attribute("data-value")?.Value == "1.25"), "XML escaping and invariant decimals");
        }
        finally { CultureInfo.CurrentCulture = originalCulture; }
        foreach (var invalid in new object?[] { null, "12", true, double.NaN, double.PositiveInfinity, float.NegativeInfinity, new object() })
        {
            rows[0]["amount"] = invalid;
            Invalid(() => Svg(), "nonnumeric or nonfinite value");
        }
        rows[0]["amount"] = double.MaxValue;
        rows[1]["amount"] = -double.MaxValue;
        Invalid(() => Svg(), "overflowed signed range");
        chart.ChartType = "donut";
        rows[1]["amount"] = double.MaxValue;
        Invalid(() => Svg(), "overflowed donut total");
        chart.ChartType = "bar";
        rows[0]["amount"] = 1;
        rows[1]["amount"] = 2;
        Invalid(() => ChartSvgRenderer.BuildChartSvg(chart, null), "missing collection");
        Invalid(() => ChartSvgRenderer.BuildChartSvg(chart, []), "empty collection");
        Check(XDocument.Parse(ChartSvgRenderer.BuildErrorSvg(chart, "No data")).Descendants().Any(element => element.Value == "No data"), "explicit empty error SVG");
        ChartSvgRenderer.BuildChartSvg(chart, Enumerable.Repeat(rows[0], 20));
        Invalid(() => ChartSvgRenderer.BuildChartSvg(chart, Enumerable.Repeat(rows[0], 21)), "category limit");
        chart.Series[0].Color = "#fff\" onload=\"bad";
        Invalid(() => Svg(), "color injection");
        chart.Series[0].Color = "#Ab12Cd";
        chart.Series[0].Label = new string('a', 33);
        Invalid(() => Svg(), "series label limit");
        chart.Series[0].Label = "Amount";
        chart.Series[0].Field = new string('a', 129);
        Invalid(() => Svg(), "series field limit");
        chart.Series[0].Field = "amount";
        chart.Title = new string('a', 81);
        Invalid(() => Svg(), "title limit");
        chart.Title = "Revenue";
        chart.DataSource = " ";
        Invalid(() => Svg(), "blank binding");
        chart.DataSource = "Rows";
        chart.LabelField = new string('a', 129);
        Invalid(() => Svg(), "label field limit");
        chart.LabelField = "name";
        chart.ChartType = "pie";
        Invalid(() => Svg(), "unknown chart type");
        chart.ChartType = "bar";
        chart.Series = [];
        Invalid(() => Svg(), "empty series");
        chart.Series = Enumerable.Range(0, 5).Select(_ => new ChartSeries { Field = "amount", Label = "Amount", Color = "#16845b" }).ToList();
        Invalid(() => Svg(), "series limit");
        chart.Series.RemoveAt(4);
        Svg();
        chart.ChartType = "donut";
        Invalid(() => Svg(), "donut requires exactly one series");
        const string templateJson = """
            {"objects":[{"type":"chart","chartType":"bar","title":"Revenue","dataSource":"Rows","labelField":"name","width":460,"height":240,"series":[{"field":"amount","label":"Amount","color":"#16845b"}]}]}
            """;
        var parsed = TemplateObjectParser.Parse(templateJson).Objects.Single() as ChartObject;
        Check(parsed is { ChartType: "bar", Width: 460, Height: 240 } && parsed.Series.Single().Field == "amount", "chart parser dispatch and contract");
        Invalid(() => TemplateObjectParser.Parse(templateJson.Replace("#16845b", "red")), "parser validates config");
        Invalid(() => TemplateObjectParser.Parse(templateJson.Replace("\"series\":[{\"field\":\"amount\",\"label\":\"Amount\",\"color\":\"#16845b\"}]", "\"series\":null")), "parser rejects null series");
        chart.ChartType = "bar";
        chart.Series = [new() { Field = "amount", Label = "Amount", Color = "#16845b" }];
        chart.Width = 240;
        chart.Title = new string('a', 31) + "\U0001F600long";
        Svg();
        chart.Title = "Revenue";
        rows[0]["name"] = double.NaN;
        Invalid(() => Svg(), "nonfinite label");
        rows[0].Remove("name");
        Invalid(() => Svg(), "missing label");
        rows[0]["name"] = "A";
        rows[0].Remove("amount");
        Invalid(() => Svg(), "missing value");
        rows[0]["amount"] = 0;
        rows[1]["amount"] = 0;
        Check(Elements(Svg(), "rect").Where(element => element.Attribute("data-value") != null).All(element => Attribute(element, "height") == 0), "all-zero bars remain valid");
        rows[0]["amount"] = -1;
        rows[1]["amount"] = -2;
        Check(Elements(Svg(), "rect").Where(element => element.Attribute("data-value") != null).All(element => Attribute(element, "y") == 41), "all-negative bars start at zero at plot top");
        rows[0]["amount"] = 1;
        rows[1]["amount"] = 2;
        Check(Elements(Svg(), "rect").Where(element => element.Attribute("data-value") != null).All(element => Near(Attribute(element, "y") + Attribute(element, "height"), 182)), "all-positive bars end at zero at plot bottom");
        chart.Title = new string('a', 80);
        chart.Series[0].Label = new string('b', 32);
        chart.Series[0].Field = new string('c', 128);
        chart.DataSource = new string('d', 128);
        chart.LabelField = new string('e', 128);
        rows = [new() { [chart.LabelField] = new string('f', 50), [chart.Series[0].Field] = 1000 }];
        var boundarySvg = Svg();
        Check(Elements(boundarySvg, "text").Any(element => element.Value == new string('a', 31) + "...")
            && Elements(boundarySvg, "text").Any(element => element.Value == new string('f', 31) + "...")
            && Elements(boundarySvg, "text").Any(element => element.Value == "1K"), "boundary configuration, truncated title/category, compact ticks");
        chart.DataSource += "d";
        Invalid(() => Svg(), "data source limit");
        chart.DataSource = "Rows";
        chart.Series[0].Label = "Amount";
        chart.Title = "bad\0text";
        Invalid(() => Svg(), "invalid XML characters");
        XDocument.Parse(ChartSvgRenderer.BuildErrorSvg(chart, "Invalid chart"));
        Console.WriteLine("All chart checks passed.");
    }

    private static bool Near(double actual, double expected) => Math.Abs(actual - expected) < .000001;
    private static void Check(bool condition, string message)
    {
        if (!condition) throw new Exception("Chart check failed: " + message);
    }
    private static void Invalid(Action action, string message)
    {
        try { action(); } catch (ArgumentException) { return; }
        throw new Exception("Chart check failed: expected ArgumentException for " + message);
    }
}