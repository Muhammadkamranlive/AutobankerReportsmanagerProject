using System.Text.Json;

namespace AutobankerReportsManager.Services;

/// <summary>
/// When data arrives over the API as raw JSON, System.Text.Json hands back JsonElement values.
/// The render service is written against plain Dictionary/List/primitive objects (so the same
/// code path works for hardcoded in-memory test data too), so we normalize here once at the edge.
/// </summary>
public static class JsonDataNormalizer
{
    public static Dictionary<string, object?> Normalize(Dictionary<string, JsonElement> raw)
    {
        var result = new Dictionary<string, object?>();
        foreach (var (key, value) in raw)
            result[key] = NormalizeElement(value);
        return result;
    }

    public static object? NormalizeElement(JsonElement element)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                var obj = new Dictionary<string, object?>();
                foreach (var prop in element.EnumerateObject())
                    obj[prop.Name] = NormalizeElement(prop.Value);
                return obj;

            case JsonValueKind.Array:
                var list = new List<object?>();
                foreach (var item in element.EnumerateArray())
                    list.Add(NormalizeElement(item));
                return list;

            case JsonValueKind.String:
                return element.GetString();

            case JsonValueKind.Number:
                return element.TryGetInt64(out var l) ? l : element.GetDouble();

            case JsonValueKind.True:
                return true;

            case JsonValueKind.False:
                return false;

            case JsonValueKind.Null:
            case JsonValueKind.Undefined:
            default:
                return null;
        }
    }
}
