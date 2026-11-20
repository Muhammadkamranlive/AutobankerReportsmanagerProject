namespace AutobankerReportsManager.Data;

/// <summary>
/// Stand-in for data your real backend will eventually supply (order/invoice lookup, etc).
/// Keys here match the {{Placeholder}} tokens used in Templates/testpdf.json.
/// </summary>
public static class SampleData
{
    public static Dictionary<string, object?> GetInvoiceTestData() => new()
    {
        ["CompanyName"] = "AutoSoft Technologies",
        ["InvoiceNo"] = "INV-2026-00123",
        ["Date"] = DateTime.Now.ToString("dd MMM yyyy"),

        // Encoded directly into the QR code image
        ["PaymentQR"] = "https://pay.autosoftapps.com/invoice/INV-2026-00123",

        // Bound to the table's dataSource ("{{Products}}"); each dictionary key
        // must match a column's "field" value in the template.
        ["Products"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["product"] = "Flutter App Development - Sprint 4",
                ["qty"] = 1,
                ["price"] = "$1,200.00",
                ["total"] = "$1,200.00"
            },
            new()
            {
                ["product"] = ".NET Messaging Service Setup",
                ["qty"] = 1,
                ["price"] = "$850.00",
                ["total"] = "$850.00"
            },
            new()
            {
                ["product"] = "UI/UX Design - Dashboard",
                ["qty"] = 2,
                ["price"] = "$300.00",
                ["total"] = "$600.00"
            },
            new()
            {
                ["product"] = "QA & Testing",
                ["qty"] = 5,
                ["price"] = "$60.00",
                ["total"] = "$300.00"
            }
        }
    };
}
