using System.Globalization;
using System.IO.Compression;
using System.Text;
using System.Xml.Linq;
using AutobankerReportsManager.Services;

QueryChecks.Run();
ChartChecks.Run();

var columns = new[] { new ExportColumn("account", "Account"), new ExportColumn("amount", "Amount") };
var rows = new List<Dictionary<string, object?>>
{
    new() { ["account"] = "00123", ["amount"] = 12.34m },
    new() { ["account"] = "a,\"b\"\nnext", ["amount"] = null },
    new() { ["account"] = " =HYPERLINK(\"bad\")", ["amount"] = -5m }
};
var csv = Encoding.UTF8.GetString(TabularReportExporter.Csv(columns, rows));
Check(csv.Contains("\"00123\",\"12.34\""), "CSV identifiers and invariant decimals");
Check(csv.Contains("\"a,\"\"b\"\"\nnext\",\"\""), "CSV quoting, line breaks and nulls");
Check(csv.Contains("\"' =HYPERLINK"), "CSV formula injection protection");
Check(csv.Contains(",\"-5\""), "CSV negative numbers remain numeric");
Check(Encoding.UTF8.GetString(TabularReportExporter.Csv(columns,
    [new() { ["account"] = "-5", ["amount"] = -5m }])).Contains("\"'-5\",\"-5\""),
    "CSV negative strings remain protected");
ExpectInvalid(() => TabularReportExporter.Csv([], rows), "Empty projection rejected");
ExpectInvalid(() => TabularReportExporter.Csv([columns[0], columns[0]], rows), "Duplicate fields rejected");
ExpectInvalid(() => TabularReportExporter.Csv(columns,
    [new() { ["account"] = new object[] { 1 } }]), "Nested data rejected");
RunXlsxChecks();
RunDocxChecks();
Console.WriteLine("All export checks passed.");

static void RunDocxChecks()
{
    XNamespace word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    XNamespace package = "http://schemas.openxmlformats.org/package/2006/relationships";
    XNamespace content = "http://schemas.openxmlformats.org/package/2006/content-types";
    var columns = new[] { new ExportColumn("value", " Header & <value>\t\r\nnext "), new ExportColumn("missing", "Missing") };
    object?[] values = ["00123", "12345678901234567890", " =HYPERLINK(\"bad\")", "+SUM(A1)", "-5", "@SUM(A1)",
        12.34m, -5m, true, false, null, new DateOnly(2026, 10, 28),
        new DateTime(2026, 10, 28, 12, 34, 56, DateTimeKind.Utc),
        new DateTimeOffset(2026, 10, 28, 12, 34, 56, TimeSpan.FromHours(5)),
        " <&>\"\r\nnext\rthird\nfourth\t end  ", "", 1.25d, 2.5f, "\t\n\r\n", "emoji: \U0001F600"];
    string[] expected = ["00123", "12345678901234567890", " =HYPERLINK(\"bad\")", "+SUM(A1)", "-5", "@SUM(A1)",
        "12.34", "-5", "true", "false", "", "2026-10-28", "2026-10-28T12:34:56.0000000Z",
        "2026-10-28T12:34:56.0000000+05:00", " <&>\"\nnext\nthird\nfourth\t end  ", "", "1.25", "2.5", "\t\n\n", "emoji: \U0001F600"];
    var rows = values.Select(value => new Dictionary<string, object?> { ["value"] = value }).ToList();
    Dictionary<string, XDocument> Parts(byte[] bytes)
    {
        using var archive = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read);
        return archive.Entries.ToDictionary(entry => entry.FullName, entry =>
        {
            using var stream = entry.Open();
            return XDocument.Load(stream);
        });
    }
    string Text(XElement element) => string.Concat(element.Descendants().Select(child =>
        child.Name == word + "t" ? child.Value : child.Name == word + "br" ? "\n" : child.Name == word + "tab" ? "\t" : ""));
    var previousCulture = CultureInfo.CurrentCulture;
    Dictionary<string, XDocument> parts;
    try
    {
        CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("fr-FR");
        parts = Parts(TabularReportExporter.Docx(columns, rows));
    }
    finally { CultureInfo.CurrentCulture = previousCulture; }
    string[] required = ["[Content_Types].xml", "_rels/.rels", "word/document.xml"];
    Check(parts.Count == 3 && required.All(parts.ContainsKey), "DOCX minimal ZIP parts are valid XML");
    var types = parts["[Content_Types].xml"];
    Check(types.Root?.Name == content + "Types"
        && types.Descendants(content + "Override").Single().Attribute("PartName")?.Value == "/word/document.xml"
        && types.Descendants(content + "Override").Single().Attribute("ContentType")?.Value
            == "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
        && types.Descendants(content + "Default").Any(element => element.Attribute("Extension")?.Value == "rels"
            && element.Attribute("ContentType")?.Value == "application/vnd.openxmlformats-package.relationships+xml")
        && types.Descendants(content + "Default").Any(element => element.Attribute("Extension")?.Value == "xml"
            && element.Attribute("ContentType")?.Value == "application/xml"), "DOCX OPC content types");
    var relationship = parts["_rels/.rels"].Descendants(package + "Relationship").Single();
    Check(relationship.Attribute("Target")?.Value == "word/document.xml"
        && relationship.Attribute("Type")?.Value == "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
        && relationship.Attribute("TargetMode") is null, "DOCX internal office document relationship");
    var document = parts["word/document.xml"];
    var body = document.Root?.Element(word + "body");
    Check(document.Root?.Name == word + "document" && body is not null
        && Text(body.Elements(word + "p").Single()) == "Report"
        && body.Elements().Last().Name == word + "sectPr", "DOCX report title and document structure");
    var table = document.Descendants(word + "tbl").Single();
    var tableRows = table.Elements(word + "tr").ToArray();
    Check(tableRows.Length == rows.Count + 1 && tableRows.All(row => row.Elements(word + "tc").Count() == columns.Length),
        "DOCX exact ordered row and column counts");
    Check(tableRows[0].Element(word + "trPr")?.Element(word + "tblHeader") is not null
        && document.Descendants(word + "tblHeader").Count() == 1, "DOCX heading repeats across pages");
    Check(tableRows[0].Elements(word + "tc").Select(Text).SequenceEqual(new[] { " Header & <value>\t\nnext ", "Missing" })
        && tableRows.Skip(1).Select(row => Text(row.Elements(word + "tc").First())).SequenceEqual(expected)
        && tableRows.Skip(1).All(row => Text(row.Elements(word + "tc").Last()) == ""),
        "DOCX ordered values preserve identifiers, decimals, booleans, dates, nulls and special text");
    Check(table.Descendants(word + "tc").All(cell => cell.Elements(word + "p").Count() == 1
            && cell.Element(word + "p")!.Elements(word + "r").Any())
        && document.Descendants(word + "t").All(text => text.Attribute(XNamespace.Xml + "space")?.Value == "preserve"
            && !text.Value.Contains('\n') && !text.Value.Contains('\r') && !text.Value.Contains('\t'))
        && tableRows[15].Descendants(word + "br").Count() == 3
        && tableRows[15].Descendants(word + "tab").Count() == 1, "DOCX paragraphs, runs, whitespace and explicit line breaks/tabs");
    Check(!document.Descendants().Any(element => new[] { "hyperlink", "fldSimple", "instrText", "object", "altChunk" }.Contains(element.Name.LocalName))
        && parts.Values.All(part => !part.Descendants(package + "Relationship").Any(element => element.Attribute("TargetMode") is not null)),
        "DOCX formula-like strings remain plain text with no active content or external links");
    void CheckLayout(XDocument layout, int columnCount, bool landscape)
    {
        var grid = layout.Descendants(word + "gridCol").Select(element => (int)element.Attribute(word + "w")!).ToArray();
        var size = layout.Descendants(word + "pgSz").Single();
        Check(size.Attribute(word + "orient")?.Value == (landscape ? "landscape" : "portrait")
            && (int)size.Attribute(word + "w")! == (landscape ? 16838 : 11906)
            && (int)size.Attribute(word + "h")! == (landscape ? 11906 : 16838)
            && grid.Length == columnCount && grid.All(width => width > 0) && grid.Max() - grid.Min() <= 1
            && grid.Sum() == (int)size.Attribute(word + "w")! - 1440
            && layout.Descendants(word + "tblW").Single().Attribute(word + "w")?.Value == grid.Sum().ToString(CultureInfo.InvariantCulture)
            && layout.Descendants(word + "tr").All(row => row.Elements(word + "tc")
                .Select(cell => (int)cell.Element(word + "tcPr")!.Element(word + "tcW")!.Attribute(word + "w")!).SequenceEqual(grid)),
            $"DOCX A4 layout and consistent grid widths for {columnCount} columns");
    }
    CheckLayout(document, 2, false);
    foreach (var count in new[] { 5, 6, 12 })
    {
        var projection = Enumerable.Range(0, count).Select(index => new ExportColumn($"c{index}", $"Header {index}")).ToArray();
        var empty = Parts(TabularReportExporter.Docx(projection, []))["word/document.xml"];
        Check(empty.Descendants(word + "tr").Count() == 1, "DOCX empty dataset retains header");
        CheckLayout(empty, count, count > 5);
    }
    foreach (var invalid in new object[] { double.NaN, double.PositiveInfinity, double.NegativeInfinity,
        float.NaN, float.PositiveInfinity, float.NegativeInfinity, new object(), new object[] { 1 }, new Dictionary<string, object?>() })
        ExpectInvalid(() => TabularReportExporter.Docx(columns, [new() { ["value"] = invalid }]), "DOCX nonfinite or nonscalar rejected");
    foreach (var invalid in new[] { new string('a', 32768), "bad\0text", "bad\u0001text", "bad\ud800text", "bad\udc00text", "bad\ufffftext" })
    {
        ExpectInvalid(() => TabularReportExporter.Docx(columns, [new() { ["value"] = invalid }]), "DOCX invalid value text rejected");
        ExpectInvalid(() => TabularReportExporter.Docx([new("value", invalid)], []), "DOCX invalid header text rejected");
    }
    ExpectInvalid(() => TabularReportExporter.Docx([], []), "DOCX empty projection rejected");
    ExpectInvalid(() => TabularReportExporter.Docx([columns[0], columns[0]], []), "DOCX duplicate projection rejected");
    ExpectInvalid(() => TabularReportExporter.Docx([new(" ", "Header")], []), "DOCX blank field rejected");
    ExpectInvalid(() => TabularReportExporter.Docx([new("value", null!)], []), "DOCX null header rejected");
    ExpectInvalid(() => TabularReportExporter.Docx(columns, [null!]), "DOCX null row rejected");
    ExpectInvalid(() => TabularReportExporter.Docx(columns, Enumerable.Range(0, 10001).Select(_ => new Dictionary<string, object?>()).ToList()), "DOCX row limit enforced");
    ExpectInvalid(() => TabularReportExporter.Docx(Enumerable.Range(0, 13).Select(index => new ExportColumn($"c{index}", "Header")).ToArray(), []), "DOCX column limit enforced");
    var maximumText = new string('a', 32767);
    var maximumRows = Enumerable.Range(0, 10000).Select(_ => new Dictionary<string, object?>()).ToList();
    maximumRows[0]["value"] = maximumText;
    var boundary = Parts(TabularReportExporter.Docx([new("value", maximumText)], maximumRows))["word/document.xml"];
    Check(boundary.Descendants(word + "tr").Count() == 10001
        && boundary.Descendants(word + "tr").Take(2).All(row => Text(row.Elements(word + "tc").Single()) == maximumText),
        "DOCX maximum rows and header/value text accepted");
}

static void RunXlsxChecks()
{
    var columns = new[] { new ExportColumn("value", " =Header & <value>"), new ExportColumn("missing", "Missing") };
    object?[] values = ["00123", "12345678901234567890", " =HYPERLINK(\"bad\")", "+SUM(A1)", "-5", "@SUM(A1)",
        12.34m, -5m, true, false, null, new DateOnly(2026, 10, 28),
        new DateTime(2026, 10, 28, 12, 34, 56, DateTimeKind.Utc),
        new DateTimeOffset(2026, 10, 28, 12, 34, 56, TimeSpan.FromHours(5)),
        " <&>\"\r\nnext ", "_x0041_", "", 1.25d, 2.5f];
    var rows = values.Select(value => new Dictionary<string, object?> { ["value"] = value }).ToList();
    var previousCulture = CultureInfo.CurrentCulture;
    byte[] bytes;
    try
    {
        CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("fr-FR");
        bytes = TabularReportExporter.Xlsx(columns, rows);
    }
    finally { CultureInfo.CurrentCulture = previousCulture; }
    using var archive = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read);
    var parts = archive.Entries.ToDictionary(entry => entry.FullName, entry =>
    {
        using var stream = entry.Open();
        return XDocument.Load(stream);
    });
    string[] expectedParts = ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"];
    Check(parts.Count == expectedParts.Length && expectedParts.All(parts.ContainsKey), "XLSX required ZIP parts, all valid XML");
    XNamespace sheet = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    XNamespace package = "http://schemas.openxmlformats.org/package/2006/relationships";
    XNamespace document = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    XNamespace content = "http://schemas.openxmlformats.org/package/2006/content-types";
    Check(parts["[Content_Types].xml"].Descendants(content + "Override").Count() == 3
        && parts["[Content_Types].xml"].Descendants(content + "Override").All(element =>
            parts.ContainsKey(((string)element.Attribute("PartName")!)[1..])
            && !((string)element.Attribute("ContentType")!).Contains("macroEnabled")), "XLSX content types map to package parts");
    Check(parts["_rels/.rels"].Descendants(package + "Relationship").Single().Attribute("Target")?.Value == "xl/workbook.xml",
        "XLSX root relationship targets workbook");
    var relationships = parts["xl/_rels/workbook.xml.rels"].Descendants(package + "Relationship").ToList();
    var workbookSheet = parts["xl/workbook.xml"].Descendants(sheet + "sheet").Single();
    Check(relationships.Any(element => element.Attribute("Id")?.Value == workbookSheet.Attribute(document + "id")?.Value
            && element.Attribute("Target")?.Value == "worksheets/sheet1.xml")
        && relationships.Any(element => element.Attribute("Target")?.Value == "styles.xml")
        && parts.Values.All(part => !part.Descendants(package + "Relationship").Any(element => element.Attribute("TargetMode") is not null)),
        "XLSX workbook relationships are internal");
    var worksheet = parts["xl/worksheets/sheet1.xml"];
    var cells = worksheet.Descendants(sheet + "c").ToDictionary(cell => (string)cell.Attribute("r")!);
    XElement Cell(int index) => cells[$"A{index + 2}"];
    Check(worksheet.Root?.Element(sheet + "dimension")?.Attribute("ref")?.Value == $"A1:B{values.Length + 1}"
        && worksheet.Descendants(sheet + "row").Count() == values.Length + 1, "XLSX dimensions include headers");
    Check(cells["A1"].Element(sheet + "is")?.Value == columns[0].Header, "XLSX header escaped as text");
    Check(Cell(0).Attribute("t")?.Value == "inlineStr" && Cell(0).Element(sheet + "is")?.Value == "00123"
        && Cell(1).Element(sheet + "is")?.Value == "12345678901234567890", "XLSX identifier strings preserved");
    Check(Enumerable.Range(2, 4).All(index => Cell(index).Attribute("t")?.Value == "inlineStr"
            && Cell(index).Element(sheet + "is")?.Value == (string)values[index]!)
        && !parts.Values.Any(part => part.Descendants(sheet + "f").Any()), "XLSX formula-like strings never become formulas");
    Check(Cell(6).Attribute("t")?.Value == "n" && Cell(6).Element(sheet + "v")?.Value == "12.34"
        && Cell(7).Element(sheet + "v")?.Value == "-5"
        && Cell(17).Element(sheet + "v")?.Value == "1.25" && Cell(18).Element(sheet + "v")?.Value == "2.5", "XLSX invariant finite numeric cells");
    Check(Cell(8).Attribute("t")?.Value == "b" && Cell(8).Element(sheet + "v")?.Value == "1"
        && Cell(9).Element(sheet + "v")?.Value == "0", "XLSX boolean cells");
    Check(!Cell(10).HasElements && !cells["B2"].HasElements, "XLSX null and missing fields are blank");
    Check(Cell(11).Attribute("t")?.Value == "d" && Cell(11).Element(sheet + "v")?.Value == "2026-10-28"
        && Cell(12).Element(sheet + "v")?.Value == "2026-10-28T12:34:56.0000000Z"
        && Cell(13).Element(sheet + "v")?.Value == "2026-10-28T12:34:56.0000000+05:00"
        && Cell(12).Attribute("s")?.Value == "1"
        && parts["xl/styles.xml"].Descendants(sheet + "cellXfs").Single().Elements().Count() == 2, "XLSX ISO dates and date style");
    Check(Cell(14).Element(sheet + "is")?.Value == (string)values[14]!
        && Cell(14).Descendants(sheet + "t").Single().Attribute(XNamespace.Xml + "space")?.Value == "preserve"
        && Cell(15).Element(sheet + "is")?.Value == "_x005F_x0041_"
        && Cell(16).Attribute("t")?.Value == "inlineStr", "XLSX whitespace, escapes and empty strings preserved");
    foreach (var invalid in new object[] { double.NaN, double.PositiveInfinity, double.NegativeInfinity, float.NaN, float.PositiveInfinity, new object() })
    {
        ExpectInvalid(() => TabularReportExporter.Xlsx(columns, [new() { ["value"] = invalid }]), "XLSX nonfinite or nonscalar rejected");
        ExpectInvalid(() => TabularReportExporter.Csv(columns, [new() { ["value"] = invalid }]), "CSV nonfinite or nonscalar rejected");
    }
    foreach (var invalid in new[] { new string('a', 32768), "bad\0text", "bad\u0001text", "bad\ud800text", "bad\ufffftext" })
    {
        ExpectInvalid(() => TabularReportExporter.Xlsx(columns, [new() { ["value"] = invalid }]), "XLSX invalid cell text rejected");
        ExpectInvalid(() => TabularReportExporter.Xlsx([new("value", invalid)], []), "XLSX invalid header rejected");
    }
    ExpectInvalid(() => TabularReportExporter.Xlsx([], []), "XLSX empty projection rejected");
    ExpectInvalid(() => TabularReportExporter.Xlsx([columns[0], columns[0]], []), "XLSX duplicate projection rejected");
    ExpectInvalid(() => TabularReportExporter.Xlsx([new(" ", "Header")], []), "XLSX empty field rejected");
    ExpectInvalid(() => TabularReportExporter.Xlsx([new("value", null!)], []), "XLSX null header rejected");
    ExpectInvalid(() => TabularReportExporter.Xlsx(columns, [null!]), "XLSX null row rejected");
    ExpectInvalid(() => TabularReportExporter.Xlsx(columns, Enumerable.Range(0, 10001).Select(_ => new Dictionary<string, object?>()).ToList()), "XLSX row limit enforced");
    ExpectInvalid(() => TabularReportExporter.Xlsx(Enumerable.Range(0, 257).Select(index => new ExportColumn($"c{index}", "Header")).ToArray(), []), "XLSX column limit enforced");
    var maximumColumns = Enumerable.Range(0, 256).Select(index => new ExportColumn($"c{index}", "Header")).ToArray();
    var maximumRows = Enumerable.Range(0, 10000).Select(_ => new Dictionary<string, object?>()).ToList();
    maximumRows[0]["c255"] = new string('a', 32767);
    using var boundaryArchive = new ZipArchive(new MemoryStream(TabularReportExporter.Xlsx(maximumColumns, maximumRows)), ZipArchiveMode.Read);
    using var boundaryStream = boundaryArchive.GetEntry("xl/worksheets/sheet1.xml")!.Open();
    var boundary = XDocument.Load(boundaryStream);
    Check(boundary.Root?.Element(sheet + "dimension")?.Attribute("ref")?.Value == "A1:IV10001"
        && boundary.Descendants(sheet + "c").Single(cell => cell.Attribute("r")?.Value == "IV2").Value.Length == 32767,
        "XLSX maximum rows, columns and cell text accepted");
}

static void Check(bool condition, string name)
{
    if (!condition) throw new InvalidOperationException(name);
    Console.WriteLine($"PASS: {name}");
}

static void ExpectInvalid(Action action, string name)
{
    try { action(); }
    catch (ArgumentException) { Console.WriteLine($"PASS: {name}"); return; }
    throw new InvalidOperationException(name);
}