using System.Globalization;
using System.IO.Compression;
using System.Text;
using System.Xml;

namespace AutobankerReportsManager.Services;

public record ExportColumn(string Field, string Header);

public static class TabularReportExporter
{
    public static byte[] Csv(IReadOnlyList<ExportColumn> columns,
        IReadOnlyList<Dictionary<string, object?>> rows)
    {
        Validate(columns, rows);
        var output = new StringBuilder();
        output.AppendLine(string.Join(",", columns.Select(column => Quote(column.Header))));
        foreach (var row in rows)
            output.AppendLine(string.Join(",", columns.Select(column =>
                row.TryGetValue(column.Field, out var value)
                    ? Quote(Format(value), value is string) : Quote(""))));
        return Encoding.UTF8.GetBytes(output.ToString());
    }

    public static byte[] Xlsx(IReadOnlyList<ExportColumn> columns,
        IReadOnlyList<Dictionary<string, object?>> rows)
    {
        Validate(columns, rows);
        foreach (var column in columns) ValidateCellText(column.Header);
        foreach (var row in rows)
            foreach (var column in columns)
                if (row.TryGetValue(column.Field, out var value) && value is string text)
                    ValidateCellText(text);

        const string spreadsheet = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        const string relationships = "http://schemas.openxmlformats.org/package/2006/relationships";
        const string documentRelationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
        using var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        {
            void Part(string path, Action<XmlWriter> write)
            {
                using var stream = archive.CreateEntry(path).Open();
                using var writer = XmlWriter.Create(stream, new XmlWriterSettings
                {
                    Encoding = new UTF8Encoding(false), NewLineHandling = NewLineHandling.Entitize
                });
                writer.WriteStartDocument();
                write(writer);
                writer.WriteEndDocument();
            }

            void Element(XmlWriter writer, string name, string ns, params string[] attributes)
            {
                writer.WriteStartElement(name, ns);
                for (var index = 0; index < attributes.Length; index += 2)
                    writer.WriteAttributeString(attributes[index], attributes[index + 1]);
                writer.WriteEndElement();
            }

            Part("[Content_Types].xml", writer =>
            {
                const string ns = "http://schemas.openxmlformats.org/package/2006/content-types";
                writer.WriteStartElement("Types", ns);
                Element(writer, "Default", ns, "Extension", "rels", "ContentType", "application/vnd.openxmlformats-package.relationships+xml");
                Element(writer, "Default", ns, "Extension", "xml", "ContentType", "application/xml");
                Element(writer, "Override", ns, "PartName", "/xl/workbook.xml", "ContentType", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml");
                Element(writer, "Override", ns, "PartName", "/xl/styles.xml", "ContentType", "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml");
                Element(writer, "Override", ns, "PartName", "/xl/worksheets/sheet1.xml", "ContentType", "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml");
                writer.WriteEndElement();
            });
            Part("_rels/.rels", writer =>
            {
                writer.WriteStartElement("Relationships", relationships);
                Element(writer, "Relationship", relationships, "Id", "rId1", "Type", documentRelationships + "/officeDocument", "Target", "xl/workbook.xml");
                writer.WriteEndElement();
            });
            Part("xl/workbook.xml", writer =>
            {
                writer.WriteStartElement("workbook", spreadsheet);
                writer.WriteStartElement("sheets", spreadsheet);
                writer.WriteStartElement("sheet", spreadsheet);
                writer.WriteAttributeString("name", "Report");
                writer.WriteAttributeString("sheetId", "1");
                writer.WriteAttributeString("r", "id", documentRelationships, "rId1");
                writer.WriteEndElement();
                writer.WriteEndElement();
                writer.WriteEndElement();
            });
            Part("xl/_rels/workbook.xml.rels", writer =>
            {
                writer.WriteStartElement("Relationships", relationships);
                Element(writer, "Relationship", relationships, "Id", "rId1", "Type", documentRelationships + "/worksheet", "Target", "worksheets/sheet1.xml");
                Element(writer, "Relationship", relationships, "Id", "rId2", "Type", documentRelationships + "/styles", "Target", "styles.xml");
                writer.WriteEndElement();
            });
            Part("xl/styles.xml", writer =>
            {
                writer.WriteStartElement("styleSheet", spreadsheet);
                writer.WriteStartElement("numFmts", spreadsheet);
                writer.WriteAttributeString("count", "1");
                Element(writer, "numFmt", spreadsheet, "numFmtId", "164", "formatCode", "yyyy-mm-dd hh:mm:ss");
                writer.WriteEndElement();
                writer.WriteStartElement("fonts", spreadsheet);
                writer.WriteAttributeString("count", "1");
                writer.WriteStartElement("font", spreadsheet);
                Element(writer, "sz", spreadsheet, "val", "11");
                Element(writer, "name", spreadsheet, "val", "Calibri");
                writer.WriteEndElement();
                writer.WriteEndElement();
                writer.WriteStartElement("fills", spreadsheet);
                writer.WriteAttributeString("count", "2");
                foreach (var pattern in new[] { "none", "gray125" })
                {
                    writer.WriteStartElement("fill", spreadsheet);
                    Element(writer, "patternFill", spreadsheet, "patternType", pattern);
                    writer.WriteEndElement();
                }
                writer.WriteEndElement();
                writer.WriteStartElement("borders", spreadsheet);
                writer.WriteAttributeString("count", "1");
                writer.WriteStartElement("border", spreadsheet);
                foreach (var edge in new[] { "left", "right", "top", "bottom", "diagonal" })
                    Element(writer, edge, spreadsheet);
                writer.WriteEndElement();
                writer.WriteEndElement();
                writer.WriteStartElement("cellStyleXfs", spreadsheet);
                writer.WriteAttributeString("count", "1");
                Element(writer, "xf", spreadsheet, "numFmtId", "0", "fontId", "0", "fillId", "0", "borderId", "0");
                writer.WriteEndElement();
                writer.WriteStartElement("cellXfs", spreadsheet);
                writer.WriteAttributeString("count", "2");
                Element(writer, "xf", spreadsheet, "numFmtId", "0", "fontId", "0", "fillId", "0", "borderId", "0", "xfId", "0");
                Element(writer, "xf", spreadsheet, "numFmtId", "164", "fontId", "0", "fillId", "0", "borderId", "0", "xfId", "0", "applyNumberFormat", "1");
                writer.WriteEndElement();
                writer.WriteStartElement("cellStyles", spreadsheet);
                writer.WriteAttributeString("count", "1");
                Element(writer, "cellStyle", spreadsheet, "name", "Normal", "xfId", "0", "builtinId", "0");
                writer.WriteEndElement();
                writer.WriteEndElement();
            });
            Part("xl/worksheets/sheet1.xml", writer =>
            {
                writer.WriteStartElement("worksheet", spreadsheet);
                Element(writer, "dimension", spreadsheet, "ref", $"A1:{ColumnName(columns.Count)}{rows.Count + 1}");
                writer.WriteStartElement("sheetData", spreadsheet);
                for (var rowIndex = 0; rowIndex <= rows.Count; rowIndex++)
                {
                    writer.WriteStartElement("row", spreadsheet);
                    writer.WriteAttributeString("r", (rowIndex + 1).ToString(CultureInfo.InvariantCulture));
                    for (var columnIndex = 0; columnIndex < columns.Count; columnIndex++)
                    {
                        var column = columns[columnIndex];
                        object? value = rowIndex == 0 ? column.Header
                            : rows[rowIndex - 1].GetValueOrDefault(column.Field);
                        writer.WriteStartElement("c", spreadsheet);
                        writer.WriteAttributeString("r", ColumnName(columnIndex + 1) + (rowIndex + 1).ToString(CultureInfo.InvariantCulture));
                        if (value is string text)
                        {
                            writer.WriteAttributeString("t", "inlineStr");
                            writer.WriteStartElement("is", spreadsheet);
                            writer.WriteStartElement("t", spreadsheet);
                            writer.WriteAttributeString("xml", "space", "http://www.w3.org/XML/1998/namespace", "preserve");
                            writer.WriteString(System.Text.RegularExpressions.Regex.Replace(text,
                                "_x[0-9a-fA-F]{4}_", match => "_x005F_" + match.Value[1..]));
                            writer.WriteEndElement();
                            writer.WriteEndElement();
                        }
                        else if (value is not null)
                        {
                            var isDate = value is DateTime or DateTimeOffset or DateOnly;
                            writer.WriteAttributeString("t", value is bool ? "b" : isDate ? "d" : "n");
                            if (isDate) writer.WriteAttributeString("s", "1");
                            writer.WriteElementString("v", spreadsheet, value is bool boolean ? boolean ? "1" : "0" : Format(value));
                        }
                        writer.WriteEndElement();
                    }
                    writer.WriteEndElement();
                }
                writer.WriteEndElement();
                writer.WriteEndElement();
            });
        }
        return output.ToArray();
    }

    public static byte[] Docx(IReadOnlyList<ExportColumn> columns,
        IReadOnlyList<Dictionary<string, object?>> rows)
    {
        Validate(columns, rows);
        if (columns.Count > 12)
            throw new ArgumentException("Word exports support at most 12 columns.");

        void ValidateText(string text)
        {
            if (text.Length > 32767)
                throw new ArgumentException("Word cell text supports at most 32,767 UTF-16 code units.");
            try { XmlConvert.VerifyXmlChars(text); }
            catch (XmlException exception)
            {
                throw new ArgumentException("Word cell text must contain valid XML characters.", exception);
            }
        }

        foreach (var column in columns) ValidateText(column.Header);
        foreach (var row in rows)
            foreach (var column in columns)
                ValidateText(Format(row.GetValueOrDefault(column.Field)));

        const string word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
        var landscape = columns.Count > 5;
        var pageWidth = landscape ? 16838 : 11906;
        var pageHeight = landscape ? 11906 : 16838;
        var tableWidth = pageWidth - 1440;
        var widths = Enumerable.Range(0, columns.Count)
            .Select(index => tableWidth / columns.Count + (index < tableWidth % columns.Count ? 1 : 0)).ToArray();
        using var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        {
            void Part(string path, Action<XmlWriter> write)
            {
                using var stream = archive.CreateEntry(path).Open();
                using var writer = XmlWriter.Create(stream, new XmlWriterSettings
                {
                    Encoding = new UTF8Encoding(false), NewLineHandling = NewLineHandling.Entitize
                });
                writer.WriteStartDocument();
                write(writer);
                writer.WriteEndDocument();
            }

            void Attribute(XmlWriter writer, string name, object value) =>
                writer.WriteAttributeString("w", name, word, Convert.ToString(value, CultureInfo.InvariantCulture));

            void Element(XmlWriter writer, string name, params object[] attributes)
            {
                writer.WriteStartElement("w", name, word);
                for (var index = 0; index < attributes.Length; index += 2)
                    Attribute(writer, (string)attributes[index], attributes[index + 1]);
                writer.WriteEndElement();
            }

            void Paragraph(XmlWriter writer, string text, bool bold)
            {
                writer.WriteStartElement("w", "p", word);
                writer.WriteStartElement("w", "r", word);
                if (bold)
                {
                    writer.WriteStartElement("w", "rPr", word);
                    Element(writer, "b");
                    writer.WriteEndElement();
                }
                var start = 0;
                for (var index = 0; index <= text.Length; index++)
                {
                    if (index < text.Length && text[index] is not ('\r' or '\n' or '\t')) continue;
                    writer.WriteStartElement("w", "t", word);
                    writer.WriteAttributeString("xml", "space", "http://www.w3.org/XML/1998/namespace", "preserve");
                    writer.WriteString(text[start..index]);
                    writer.WriteEndElement();
                    if (index < text.Length)
                    {
                        Element(writer, text[index] == '\t' ? "tab" : "br");
                        if (text[index] == '\r' && index + 1 < text.Length && text[index + 1] == '\n') index++;
                    }
                    start = index + 1;
                }
                writer.WriteEndElement();
                writer.WriteEndElement();
            }

            Part("[Content_Types].xml", writer =>
            {
                const string content = "http://schemas.openxmlformats.org/package/2006/content-types";
                writer.WriteStartElement("Types", content);
                foreach (var definition in new[]
                {
                    ("Default", "Extension", "rels", "application/vnd.openxmlformats-package.relationships+xml"),
                    ("Default", "Extension", "xml", "application/xml"),
                    ("Override", "PartName", "/word/document.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml")
                })
                {
                    writer.WriteStartElement(definition.Item1, content);
                    writer.WriteAttributeString(definition.Item2, definition.Item3);
                    writer.WriteAttributeString("ContentType", definition.Item4);
                    writer.WriteEndElement();
                }
                writer.WriteEndElement();
            });
            Part("_rels/.rels", writer =>
            {
                const string relationships = "http://schemas.openxmlformats.org/package/2006/relationships";
                writer.WriteStartElement("Relationships", relationships);
                writer.WriteStartElement("Relationship", relationships);
                writer.WriteAttributeString("Id", "rId1");
                writer.WriteAttributeString("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument");
                writer.WriteAttributeString("Target", "word/document.xml");
                writer.WriteEndElement();
                writer.WriteEndElement();
            });
            Part("word/document.xml", writer =>
            {
                writer.WriteStartElement("w", "document", word);
                writer.WriteStartElement("w", "body", word);
                Paragraph(writer, "Report", true);
                writer.WriteStartElement("w", "tbl", word);
                writer.WriteStartElement("w", "tblPr", word);
                Element(writer, "tblW", "w", tableWidth, "type", "dxa");
                Element(writer, "tblLayout", "type", "fixed");
                writer.WriteEndElement();
                writer.WriteStartElement("w", "tblGrid", word);
                foreach (var width in widths) Element(writer, "gridCol", "w", width);
                writer.WriteEndElement();
                for (var rowIndex = 0; rowIndex <= rows.Count; rowIndex++)
                {
                    writer.WriteStartElement("w", "tr", word);
                    if (rowIndex == 0)
                    {
                        writer.WriteStartElement("w", "trPr", word);
                        Element(writer, "tblHeader");
                        writer.WriteEndElement();
                    }
                    for (var columnIndex = 0; columnIndex < columns.Count; columnIndex++)
                    {
                        var column = columns[columnIndex];
                        writer.WriteStartElement("w", "tc", word);
                        writer.WriteStartElement("w", "tcPr", word);
                        Element(writer, "tcW", "w", widths[columnIndex], "type", "dxa");
                        writer.WriteEndElement();
                        Paragraph(writer, rowIndex == 0 ? column.Header
                            : Format(rows[rowIndex - 1].GetValueOrDefault(column.Field)), rowIndex == 0);
                        writer.WriteEndElement();
                    }
                    writer.WriteEndElement();
                }
                writer.WriteEndElement();
                writer.WriteStartElement("w", "sectPr", word);
                Element(writer, "pgSz", "w", pageWidth, "h", pageHeight, "orient", landscape ? "landscape" : "portrait");
                Element(writer, "pgMar", "top", 720, "right", 720, "bottom", 720, "left", 720, "header", 360, "footer", 360, "gutter", 0);
                writer.WriteEndElement();
                writer.WriteEndElement();
                writer.WriteEndElement();
            });
        }
        return output.ToArray();
    }

    private static string ColumnName(int number)
    {
        var name = "";
        while (number > 0)
        {
            number--;
            name = (char)('A' + number % 26) + name;
            number /= 26;
        }
        return name;
    }

    private static void ValidateCellText(string text)
    {
        if (text.Length > 32767)
            throw new ArgumentException("XLSX cell text supports at most 32,767 UTF-16 code units.");
        try { XmlConvert.VerifyXmlChars(text); }
        catch (XmlException exception)
        {
            throw new ArgumentException("XLSX cell text must contain valid XML characters.", exception);
        }
    }

    private static void Validate(IReadOnlyList<ExportColumn> columns,
        IReadOnlyList<Dictionary<string, object?>> rows)
    {
        if (columns.Count is < 1 or > 256)
            throw new ArgumentException("Supply between 1 and 256 columns.");
        if (rows.Count > 10000)
            throw new ArgumentException("Interactive exports support at most 10,000 rows.");
        if (columns.Any(column => string.IsNullOrWhiteSpace(column.Field) || column.Header is null))
            throw new ArgumentException("Every column needs a field and header.");
        if (columns.Select(column => column.Field).Distinct(StringComparer.Ordinal).Count() != columns.Count)
            throw new ArgumentException("Column fields must be unique.");
        foreach (var row in rows)
        {
            if (row is null) throw new ArgumentException("Rows cannot be null.");
            foreach (var column in columns)
            {
                if (row.TryGetValue(column.Field, out var number)
                    && (number is double doubleValue && !double.IsFinite(doubleValue)
                        || number is float floatValue && !float.IsFinite(floatValue)))
                    throw new ArgumentException($"Field '{column.Field}' must contain a finite number.");
                if (row.TryGetValue(column.Field, out var value) && value is not null
                    && value is not (string or bool or byte or sbyte or short or ushort
                        or int or uint or long or ulong or float or double or decimal
                        or DateTime or DateTimeOffset or DateOnly))
                    throw new ArgumentException($"Field '{column.Field}' must contain a scalar value.");
                    }
        }
    }

    private static string Format(object? value) => value switch
    {
        null => "",
        DateTime date => date.ToString("O", CultureInfo.InvariantCulture),
        DateTimeOffset date => date.ToString("O", CultureInfo.InvariantCulture),
        DateOnly date => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        bool boolean => boolean ? "true" : "false",
        IFormattable formatted => formatted.ToString(null, CultureInfo.InvariantCulture),
        _ => value.ToString() ?? ""
    };

    private static string Quote(string value, bool protectFormula = true)
    {
        var candidate = value.AsSpan().TrimStart();
        if (protectFormula && candidate.Length > 0 && (candidate[0] is '=' or '+' or '-' or '@'
            || value[0] is '\t' or '\r' or '\n')) value = "'" + value;
        return "\"" + value.Replace("\"", "\"\"") + "\"";
    }
}