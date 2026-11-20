using System.Text.Json;

namespace AutobankerReportsManager.Services;

public record SavedTemplate(string Id, string Name, DateTimeOffset SavedAtUtc, JsonElement Template);

public sealed class TemplateRepository(IWebHostEnvironment environment, IConfiguration configuration)
{
    private readonly string directory = Path.GetFullPath(configuration["TemplateStorage:Path"]
        ?? "SavedTemplates", environment.ContentRootPath);

    public IEnumerable<object> List()
    {
        Directory.CreateDirectory(directory);
        return Directory.EnumerateFiles(directory, "*.json").Select(path =>
        {
            var saved = JsonSerializer.Deserialize<SavedTemplate>(File.ReadAllText(path))!;
            return new { saved.Id, saved.Name, saved.SavedAtUtc };
        }).ToArray();
    }

    public SavedTemplate? Get(string id)
    {
        var path = GetPath(id);
        return File.Exists(path) ? JsonSerializer.Deserialize<SavedTemplate>(File.ReadAllText(path)) : null;
    }

    public SavedTemplate Save(JsonElement template, string? id = null)
    {
        if (template.ValueKind != JsonValueKind.Object || !template.TryGetProperty("objects", out var objects)
            || objects.ValueKind != JsonValueKind.Array || !template.TryGetProperty("page", out var page)
            || page.ValueKind != JsonValueKind.Object)
            throw new ArgumentException("A template with page settings and an objects array is required.");
        foreach (var item in objects.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty("type", out var type)
                || type.ValueKind != JsonValueKind.String
                || type.GetString() is not ("text" or "rect" or "circle" or "line" or "image" or "qrcode" or "barcode" or "table" or "chart"))
                throw new ArgumentException("Every template object must have a supported type.");
        }
        var parsed = TemplateObjectParser.Parse(template.GetRawText());
        if (string.IsNullOrWhiteSpace(parsed.Name) || parsed.Name.Length > 160)
            throw new ArgumentException("Template name must contain 1 to 160 characters.");
        if (!float.IsFinite(parsed.Page.Width) || !float.IsFinite(parsed.Page.Height)
            || parsed.Page.Width <= 0 || parsed.Page.Height <= 0
            || parsed.Page.Width > 14400 || parsed.Page.Height > 14400)
            throw new ArgumentException("Page dimensions must be between 0 and 14,400 points.");
        foreach (var item in parsed.Objects)
        {
            if (!float.IsFinite(item.Width) || !float.IsFinite(item.Height) || item.Width <= 0 || item.Height <= 0
                || !float.IsFinite(item.X) || !float.IsFinite(item.Y) || !float.IsFinite(item.Rotation))
                throw new ArgumentException("Template objects need finite coordinates and positive dimensions.");
            if (item is AutobankerReportsManager.Models.TableObject table
                && (table.Columns is null || table.Columns.Count == 0
                    || table.Columns.Any(column => column is null || string.IsNullOrWhiteSpace(column.Field))))
                throw new ArgumentException("Tables need columns with field bindings.");
        }
        id ??= Guid.NewGuid().ToString("N");
        var path = GetPath(id);
        Directory.CreateDirectory(directory);
        var saved = new SavedTemplate(id, parsed.Name, DateTimeOffset.UtcNow, template.Clone());
        var temporary = Path.Combine(directory, $"{id}.{Guid.NewGuid():N}.tmp");
        try
        {
            File.WriteAllText(temporary, JsonSerializer.Serialize(saved));
            File.Move(temporary, path, overwrite: true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
        return saved;
    }

    private string GetPath(string id)
    {
        if (!Guid.TryParseExact(id, "N", out _)) throw new ArgumentException("Invalid template ID.");
        return Path.Combine(directory, $"{id}.json");
    }
}