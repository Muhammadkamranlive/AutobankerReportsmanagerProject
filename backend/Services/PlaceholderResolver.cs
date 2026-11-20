using System.Text.RegularExpressions;

namespace AutobankerReportsManager.Services;

public static class PlaceholderResolver
{
    private static readonly Regex TokenPattern = new(@"\{\{\s*([\w.]+)\s*\}\}", RegexOptions.Compiled);
    private static readonly Regex PageTokenPattern = new(@"\{\{\s*(page|pages)\s*\}\}", RegexOptions.Compiled);

    /// <summary>
    /// Replaces every {{Key}} token with the matching value from <paramref name="data"/>.
    /// {{page}} and {{pages}} are intentionally left untouched - those are resolved
    /// at render time via QuestPDF's CurrentPageNumber()/TotalPages(), since the
    /// final page count isn't known until layout is complete.
    /// Unknown keys are left as-is so missing data is obvious in the output rather than silently blank.
    /// </summary>
    public static string Resolve(string? template, IReadOnlyDictionary<string, object?> data)
    {
        if (string.IsNullOrEmpty(template)) return template ?? string.Empty;

        return TokenPattern.Replace(template, match =>
        {
            var key = match.Groups[1].Value;
            if (key is "page" or "pages") return match.Value;

            return data.TryGetValue(key, out var value) && value is not null
                ? Convert.ToString(value) ?? string.Empty
                : match.Value;
        });
    }

    /// <summary>Pulls the variable name out of a single placeholder, e.g. "{{Products}}" -> "Products".</summary>
    public static string ExtractKey(string? placeholder)
    {
        if (string.IsNullOrEmpty(placeholder)) return string.Empty;
        var match = TokenPattern.Match(placeholder);
        return match.Success ? match.Groups[1].Value : placeholder;
    }

    public static bool HasPageTokens(string text) => PageTokenPattern.IsMatch(text);

    /// <summary>Splits text into literal segments and page/pages tokens, in order, for dynamic text rendering.</summary>
    public static IEnumerable<(bool isPageToken, string value)> SplitOnPageTokens(string text)
    {
        var lastIndex = 0;
        foreach (Match m in PageTokenPattern.Matches(text))
        {
            if (m.Index > lastIndex)
                yield return (false, text[lastIndex..m.Index]);

            yield return (true, m.Groups[1].Value); // "page" or "pages"
            lastIndex = m.Index + m.Length;
        }

        if (lastIndex < text.Length)
            yield return (false, text[lastIndex..]);
    }
}
