# Autobanker Reports Manager

ASP.NET Core Web API that renders a PDF from a JSON layout template (the same shape
as your `testpdf.json`) plus a data dictionary. Objects are drawn at their exact
`x`/`y`/`width`/`height` using QuestPDF's layer + translate mechanism, so the template's
absolute-positioning model maps directly instead of fighting a flow layout.

## Run it

```bash
dotnet restore
dotnet run --urls http://127.0.0.1:5081
```

Then hit:

```
GET  http://127.0.0.1:5081/api/pdf/sample
```

This loads `Templates/testpdf.json` + the hardcoded `Data/SampleData.cs` and streams
back a PDF — the fastest way to confirm everything renders end to end. Swagger UI is
available at `/swagger` in development.

## Endpoints

- **`GET /api/pdf/sample`** — template + data both hardcoded server-side. Use this first.
- **`POST /api/pdf/generate`** — body: `{ "template": {...same shape as testpdf.json...}, "data": {...} }`. Returns the rendered PDF. Useful while you're still designing templates client-side.
- **`POST /api/pdf/generate/{templateName}`** — loads `Templates/{templateName}.json` from disk and renders it with the posted `data` object. Closer to how you'll likely use this once a template is finalized and saved once, then reused with different data on every call (e.g. one invoice template, hundreds of invoices).

## How the template maps to data

- Any `text` object's `text` field runs through placeholder substitution: `{{CompanyName}}` → `data["CompanyName"]`.
- A `qrcode` object's `variable` (e.g. `{{PaymentQR}}`) is looked up in `data` and the resulting string is what gets encoded into the QR image — not rendered as text.
- A `table` object's `dataSource` (e.g. `{{Products}}`) is looked up in `data` and expected to be a list of row objects; each column's `field` key pulls the matching value out of each row.
- `{{page}}` / `{{pages}}` inside any text are handled specially — resolved dynamically by QuestPDF at layout time (via `CurrentPageNumber()`/`TotalPages()`), since the final page count isn't known until rendering finishes. This is what the `pagination` block and the "Page {{page}} of {{pages}}" footer object are wired for.
- `hidden: true` objects are skipped. `locked` is editor-only metadata and doesn't affect rendering.
- Page `margins` are template metadata only and are **not** enforced as a hard boundary — several of your own template's objects (logo at `y: 8`, QR code at `y: 10`) are deliberately positioned above the 36pt top margin, so every object is placed purely by its own absolute coordinates.

## Wiring in real data later

Swap `Data/SampleData.cs` for whatever actually builds the dictionary — a repository
call, a mapped DTO, etc. The render service (`Services/PdfRenderService.cs`) only cares
about a `Dictionary<string, object?>`; it doesn't know or care where the values came from.

## Notes

- **No SkiaSharp dependency.** Rect, line, and watermark rendering use QuestPDF's
  supported `.Svg(...)` API (inline SVG markup generated per-object), not the Canvas API —
  which QuestPDF deprecated in 2024.3.0. If you added a `SkiaSharp` package reference while
  troubleshooting earlier, it's safe to remove; nothing here uses it.
- **Colors** go through `QuestPDF.Infrastructure.Color.FromHex(...)`, QuestPDF's own color
  type — not `System.Drawing.Color` or `SkiaSharp.SKColor`.
- **`Table()` cell sizing** — QuestPDF's table auto-sizes row height from padding + font
  size rather than taking a hard `rowHeight` value. I approximated it via padding
  (`(rowHeight - fontSize) / 2`) — close visually, but not pixel-exact to the template's
  declared `rowHeight`/`headerHeight`.
- **QuestPDF Community license** — `QuestPDF.Settings.License = LicenseType.Community` is
  set in `PdfRenderService`'s static constructor. Free for individuals/small teams under
  $1M annual revenue — check questpdf.com/license if that doesn't apply to you.
- This version's API usage (`.Rotate(float)`, `.Svg(Func<Size,string>)`, `Color.FromHex`,
  `PngByteQRCode.GetGraphic(pixelsPerModule, darkColorRgba, lightColorRgba)`) was checked
  against QuestPDF 2024.10.4 and QRCoder 1.6.0 docs/source directly, so it should compile
  cleanly against the versions your build log showed.

## Project layout

```
AutobankerReportsManager/
  Models/TemplateModels.cs       - POCOs matching the template JSON schema
  Services/TemplateObjectParser.cs   - deserializes the polymorphic objects[] array
  Services/PlaceholderResolver.cs    - {{Token}} substitution + page/pages handling
  Services/JsonDataNormalizer.cs     - JsonElement -> plain Dictionary/List for API-posted data
  Services/PdfRenderService.cs       - the actual QuestPDF rendering logic
  Controllers/PdfController.cs       - the three endpoints above
  Data/SampleData.cs             - in-memory test data (swap for real data later)
  Templates/testpdf.json         - your uploaded template, copied in as-is
```
