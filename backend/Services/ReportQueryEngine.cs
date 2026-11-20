using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace AutobankerReportsManager.Services;

public sealed class ReportQuery
{
    public List<QuerySource> Sources { get; set; } = [];
    public string From { get; set; } = "";
    public List<QueryJoin> Joins { get; set; } = [];
    public List<QueryFilter> Filters { get; set; } = [];
    public List<QueryProjection> Select { get; set; } = [];
    public List<string> GroupBy { get; set; } = [];
    public List<QuerySort> Sort { get; set; } = [];
}

public sealed class QuerySource
{
    public string Alias { get; set; } = "";
    public List<string> Fields { get; set; } = [];
    public List<Dictionary<string, JsonElement>> Rows { get; set; } = [];
}

public sealed class QueryJoin
{
    public string Source { get; set; } = "";
    public string Kind { get; set; } = "inner";
    public string Left { get; set; } = "";
    public string Right { get; set; } = "";
}

public sealed class QueryFilter
{
    public string Field { get; set; } = "";
    public string Operator { get; set; } = "eq";
    public JsonElement Value { get; set; }
}

public sealed class QueryProjection
{
    public string Field { get; set; } = "";
    public string Alias { get; set; } = "";
    public string Aggregate { get; set; } = "none";
}

public sealed class QuerySort
{
    public string Field { get; set; } = "";
    public bool Descending { get; set; }
}

public sealed record QueryResult(IReadOnlyList<ExportColumn> Columns,
    IReadOnlyList<Dictionary<string, object?>> Rows, int InputRows);

public static class ReportQueryEngine
{
    public const int RowLimit = 10000;
    private static readonly Regex Identifier = new("^[A-Za-z_][A-Za-z0-9_]{0,63}$", RegexOptions.CultureInvariant);

    public static QueryResult Execute(ReportQuery query, CancellationToken cancellationToken = default)
    {
        Require(query is not null, "Query is required.");
        Require(query!.Sources is { Count: > 0 and <= 8 }, "Supply between 1 and 8 collections.");
        Require(query.Joins is { Count: <= 7 } && query.Filters is { Count: <= 32 }
            && query.GroupBy is { Count: <= 32 } && query.Sort is { Count: <= 32 }, "Query exceeds operation limits.");
        Require(query.Select is { Count: > 0 and <= 256 }, "Select between 1 and 256 output fields.");
        var sources = new Dictionary<string, QuerySource>(StringComparer.Ordinal);
        var inputRows = 0;
        foreach (var source in query.Sources)
        {
            Require(source is not null && ValidIdentifier(source.Alias), "Every collection needs a valid alias.");
            Require(sources.TryAdd(source!.Alias, source), "Collection aliases must be unique.");
            Require(source.Fields is { Count: > 0 and <= 256 }
                && source.Fields.All(ValidPath) && source.Fields.Distinct(StringComparer.Ordinal).Count() == source.Fields.Count,
                "Collection fields must be unique scalar paths (maximum 256).");
            Require(source.Rows is not null, "Collection rows are required.");
            inputRows += source.Rows!.Count;
            Require(inputRows <= RowLimit, "Interactive queries support at most 10,000 input rows in total.");
        }
        Require(query.From is not null && sources.ContainsKey(query.From), "Select an existing starting collection.");
        var fields = sources[query.From].Fields.Select(field => query.From + "." + field).ToHashSet(StringComparer.Ordinal);
        var joined = new HashSet<string>(StringComparer.Ordinal) { query.From };
        var rows = ReadSource(sources[query.From], cancellationToken);
        foreach (var join in query.Joins)
        {
            Require(join is not null && join.Source is not null && sources.ContainsKey(join.Source) && joined.Add(join.Source),
                "Each join must introduce an unused collection.");
            Require(join!.Kind is "inner" or "left", "Only INNER and LEFT joins are supported.");
            Require(fields.Contains(join.Left), "Join left field must belong to an earlier collection.");
            var source = sources[join.Source];
            var addedFields = source.Fields.Select(field => join.Source + "." + field).ToArray();
            Require(addedFields.Contains(join.Right, StringComparer.Ordinal), "Join right field must belong to the added collection.");
            var lookup = ReadSource(source, cancellationToken).Where(row => row[join.Right] is not null)
                .ToLookup(row => row[join.Right]!);
            var result = new List<Dictionary<string, object?>>();
            foreach (var row in rows)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var matches = row[join.Left] is { } key ? lookup[key].ToArray() : [];
                if (matches.Length == 0 && join.Kind == "left")
                {
                    var merged = new Dictionary<string, object?>(row, StringComparer.Ordinal);
                    foreach (var field in addedFields) merged[field] = null;
                    AddBounded(result, merged);
                }
                foreach (var match in matches)
                {
                    var merged = new Dictionary<string, object?>(row, StringComparer.Ordinal);
                    foreach (var field in addedFields) merged[field] = match[field];
                    AddBounded(result, merged);
                }
            }
            rows = result;
            fields.UnionWith(addedFields);
        }
        foreach (var filter in query.Filters)
        {
            Require(filter is not null && fields.Contains(filter.Field), "Filter references an unknown field.");
            Require(filter!.Operator is "eq" or "ne" or "gt" or "gte" or "lt" or "lte" or "contains" or "isNull" or "notNull",
                "Unsupported filter operator.");
            var operand = filter.Operator is "isNull" or "notNull" ? null : Scalar(filter.Value);
            Require(filter.Operator is "isNull" or "notNull" || operand is not null, "Use an explicit null operator for null values.");
            rows = rows.Where(row => Matches(row[filter.Field], filter.Operator, operand)).ToList();
        }
        var aliases = new HashSet<string>(StringComparer.Ordinal);
        foreach (var projection in query.Select)
        {
            Require(projection is not null && ValidIdentifier(projection.Alias) && aliases.Add(projection.Alias),
                "Output aliases must be unique identifiers.");
            Require(projection!.Aggregate is "none" or "count" or "sum" or "average" or "min" or "max", "Unsupported aggregate.");
            Require(fields.Contains(projection.Field) || projection is { Field: "*", Aggregate: "count" }, "Projection references an unknown field.");
        }
        Require(query.GroupBy.All(fields.Contains) && query.GroupBy.Distinct().Count() == query.GroupBy.Count, "Invalid grouping fields.");
        var aggregate = query.GroupBy.Count > 0 || query.Select.Any(item => item.Aggregate != "none");
        if (aggregate)
            Require(query.Select.Where(item => item.Aggregate == "none").All(item => query.GroupBy.Contains(item.Field)),
                "Every non-aggregate output must be a grouping field.");
        List<Dictionary<string, object?>> projected;
        try
        {
            if (!aggregate)
                projected = rows.Select(row => query.Select.ToDictionary(item => item.Alias, item => row[item.Field], StringComparer.Ordinal)).ToList();
            else
            {
                var groups = query.GroupBy.Count == 0
                    ? new[] { rows.AsEnumerable() }
                    : rows.GroupBy(row => query.GroupBy.Select(field => row[field]).ToArray(), new GroupKeyComparer()).Select(group => group.AsEnumerable());
                projected = groups.Select(group =>
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    var members = group.ToList();
                    return query.Select.ToDictionary(item => item.Alias,
                        item => item.Aggregate == "none" ? members[0][item.Field] : Aggregate(members, item), StringComparer.Ordinal);
                }).ToList();
            }
        }
        catch (OverflowException) { throw new ArgumentException("Numeric aggregate exceeds decimal precision."); }
        foreach (var sort in query.Sort)
        {
            Require(sort is not null && aliases.Contains(sort.Field), "Sort references an unknown output field.");
            Require(projected.Select(row => row[sort!.Field]?.GetType()).Where(type => type is not null).Distinct().Count() <= 1,
                "Cannot sort mixed field types; normalize your collection schema first.");
        }
        IOrderedEnumerable<Dictionary<string, object?>>? ordered = null;
        foreach (var sort in query.Sort)
        {
            Func<Dictionary<string, object?>, object?> selector = row => row[sort.Field];
            var comparer = Comparer<object?>.Create(Compare);
            ordered = ordered is null
                ? (sort.Descending ? projected.OrderByDescending(selector, comparer) : projected.OrderBy(selector, comparer))
                : (sort.Descending ? ordered.ThenByDescending(selector, comparer) : ordered.ThenBy(selector, comparer));
        }
        cancellationToken.ThrowIfCancellationRequested();
        Require(projected.Sum(row => row.Values.Sum(value => value is string text ? (long)text.Length : 32L)) <= 5 * 1024 * 1024,
            "Query result exceeds the interactive text budget. Reduce rows or projected fields.");
        return new QueryResult(query.Select.Select(item => new ExportColumn(item.Alias, item.Alias)).ToArray(),
            ordered?.ToList() ?? projected, inputRows);
    }

    private static List<Dictionary<string, object?>> ReadSource(QuerySource source, CancellationToken cancellationToken)
    {
        var result = new List<Dictionary<string, object?>>();
        foreach (var input in source.Rows)
        {
            cancellationToken.ThrowIfCancellationRequested();
            Require(input is not null, "Collection rows must be objects.");
            var row = new Dictionary<string, object?>(StringComparer.Ordinal);
            foreach (var field in source.Fields)
            {
                var segments = field.Split('.');
                input!.TryGetValue(segments[0], out var value);
                foreach (var segment in segments.Skip(1))
                    value = value.ValueKind == JsonValueKind.Object && value.TryGetProperty(segment, out var nested) ? nested : default;
                row[source.Alias + "." + field] = Scalar(value);
            }
            result.Add(row);
        }
        return result;
    }

    private static object? Scalar(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Undefined or JsonValueKind.Null => null,
        JsonValueKind.String when value.GetString()!.Length <= 32767 => value.GetString(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Number when value.TryGetDecimal(out var number) => number,
        _ => throw new ArgumentException("Fields and filter values must be scalar JSON values; text must fit 32,767 characters and numbers must fit decimal range.")
    };

    private static object? Aggregate(List<Dictionary<string, object?>> rows, QueryProjection projection)
    {
        if (projection.Field == "*") return (decimal)rows.Count;
        var values = rows.Select(row => row[projection.Field]).Where(value => value is not null).ToList();
        if (projection.Aggregate == "count") return (decimal)values.Count;
        if (values.Count == 0) return projection.Aggregate == "sum" ? 0m : null;
        if (projection.Aggregate is "sum" or "average")
        {
            Require(values.All(value => value is decimal), "SUM and AVERAGE require numeric fields.");
            return projection.Aggregate == "sum" ? values.Cast<decimal>().Sum() : values.Cast<decimal>().Average();
        }
        return values.Aggregate((current, value) =>
            (Compare(current, value) < 0) == (projection.Aggregate == "min") ? current : value);
    }

    private static bool Matches(object? value, string operation, object? operand)
    {
        if (operation == "isNull") return value is null;
        if (operation == "notNull") return value is not null;
        if (value is null) return false;
        if (operation == "contains")
        {
            Require(value is string && operand is string, "CONTAINS requires text values.");
            return ((string)value).Contains((string)operand!, StringComparison.OrdinalIgnoreCase);
        }
        var comparison = Compare(value, operand);
        return operation switch
        {
            "eq" => comparison == 0, "ne" => comparison != 0, "gt" => comparison > 0,
            "gte" => comparison >= 0, "lt" => comparison < 0, "lte" => comparison <= 0, _ => false
        };
    }

    private static int Compare(object? left, object? right)
    {
        if (left is null) return right is null ? 0 : -1;
        if (right is null) return 1;
        Require(left.GetType() == right.GetType(), "Cannot compare mixed field types; normalize your collection schema first.");
        return left switch
        {
            decimal number => number.CompareTo((decimal)right),
            string text => string.Compare(text, (string)right, StringComparison.Ordinal),
            bool boolean => boolean.CompareTo((bool)right),
            _ => throw new ArgumentException("Unsupported comparison.")
        };
    }

    private static void AddBounded(List<Dictionary<string, object?>> rows, Dictionary<string, object?> row)
    {
        Require(rows.Count < RowLimit, "Join exceeds 10,000 output rows. Refine the join before running.");
        rows.Add(row);
    }

    private static bool ValidIdentifier(string? value) => value is not null && Identifier.IsMatch(value);
    private static bool ValidPath(string? value) => value is not null && value.Split('.') is { Length: <= 8 } parts && parts.All(ValidIdentifier);
    private sealed class GroupKeyComparer : IEqualityComparer<object?[]>
    {
        public bool Equals(object?[]? left, object?[]? right) =>
            ReferenceEquals(left, right) || left is not null && right is not null && left.SequenceEqual(right);

        public int GetHashCode(object?[] values)
        {
            var hash = new HashCode();
            foreach (var value in values) hash.Add(value);
            return hash.ToHashCode();
        }
    }

    private static void Require([DoesNotReturnIf(false)] bool condition, string message)
    {
        if (!condition) throw new ArgumentException(message);
    }
}