using System.Text.Json;
using AutobankerReportsManager.Services;

internal static class QueryChecks
{
    public static void Run()
    {
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        ReportQuery Query() => JsonSerializer.Deserialize<ReportQuery>("""
        {
          "sources": [
            { "alias":"customers", "fields":["id","name","address.city"], "rows":[
              {"id":1,"name":"Ada","address":{"city":"London"}}, {"id":2,"name":"Lin"}, {"id":null,"name":"Null"}] },
            { "alias":"accounts", "fields":["customerId","amount"], "rows":[
              {"customerId":1,"amount":10.25},{"customerId":1,"amount":20.75},{"customerId":null,"amount":100}] }
          ],
          "from":"customers",
          "joins":[{"source":"accounts","kind":"left","left":"customers.id","right":"accounts.customerId"}],
          "select":[{"field":"customers.name","alias":"customer"},{"field":"accounts.amount","alias":"amount"}],
          "sort":[{"field":"amount","descending":true}]
        }
        """, options)!;
        var result = ReportQueryEngine.Execute(Query());
        Check(result.Rows.Count == 4 && (decimal)result.Rows[0]["amount"]! == 20.75m, "LEFT join and descending projection sort");
        Check(result.Rows.Count(row => row["amount"] is null) == 2, "NULL join keys never match; unmatched parents survive");
        var grouped = Query();
        grouped.GroupBy = ["customers.name"];
        grouped.Select[1].Aggregate = "sum";
        var totals = ReportQueryEngine.Execute(grouped);
        Check(totals.Rows.Count == 3 && (decimal)totals.Rows[0]["amount"]! == 31m, "Grouping preserves decimal totals");
        var filtered = Query();
        filtered.Filters = [new QueryFilter { Field = "accounts.amount", Operator = "gte", Value = JsonSerializer.SerializeToElement(20) }];
        Check(ReportQueryEngine.Execute(filtered).Rows.Count == 1, "Typed numeric filter after join");
        filtered.Filters[0].Operator = "isNull";
        Check(ReportQueryEngine.Execute(filtered).Rows.Count == 2, "Explicit NULL filter");
        var nested = Query();
        nested.Select = [new QueryProjection { Field = "customers.address.city", Alias = "city" }];
        nested.Sort = [];
        Check(ReportQueryEngine.Execute(nested).Rows.Count(row => Equals(row["city"], "London")) == 2, "Nested scalar paths");
        var invalid = Query();
        invalid.Select[0].Field = "missing.field";
        Invalid(() => ReportQueryEngine.Execute(invalid), "Unknown projection rejected");
        invalid = Query();
        invalid.Select[1].Aggregate = "sum";
        Invalid(() => ReportQueryEngine.Execute(invalid), "Ungrouped non-aggregate field rejected");
        invalid = Query();
        invalid.Sources[0].Rows = Enumerable.Repeat(invalid.Sources[0].Rows[0], 5001).ToList();
        Invalid(() => ReportQueryEngine.Execute(invalid), "Join expansion budget enforced");
        invalid = Query();
        invalid.Sources[0].Rows = [];
        invalid.Select = [new QueryProjection { Field = "*", Alias = "count", Aggregate = "count" }];
        invalid.Sort = [];
        Check(Equals(ReportQueryEngine.Execute(invalid).Rows[0]["count"], 0m), "Empty aggregate COUNT returns zero");
        var scales = JsonSerializer.Deserialize<ReportQuery>("""
        {"sources":[{"alias":"Rows","fields":["amount"],"rows":[{"amount":1},{"amount":1.0},{"amount":1.00}]}],
        "from":"Rows","select":[{"field":"Rows.amount","alias":"amount"},{"field":"*","alias":"count","aggregate":"count"}],"groupBy":["Rows.amount"]}
        """, options)!;
        Check(ReportQueryEngine.Execute(scales).Rows.Count == 1 && Equals(ReportQueryEngine.Execute(scales).Rows[0]["count"], 3m),
          "Numeric grouping ignores equivalent decimal scales");
        var mixed = Query();
        mixed.Sources[1].Rows[0]["amount"] = JsonSerializer.SerializeToElement("text");
        Invalid(() => ReportQueryEngine.Execute(mixed), "Mixed-type sorting rejected before comparer execution");
        var oversized = Query();
        oversized.Sources[0].Rows[0]["name"] = JsonSerializer.SerializeToElement(new string('x', 32768));
        Invalid(() => ReportQueryEngine.Execute(oversized), "Oversized scalar text rejected");
        oversized.Sources[0].Rows = Enumerable.Repeat(oversized.Sources[0].Rows[0], 200).ToList();
        oversized.Sources[0].Rows[0]["name"] = JsonSerializer.SerializeToElement(new string('x', 32767));
        oversized.Joins = [];
        oversized.Sort = [];
        oversized.Select = [new QueryProjection { Field = "customers.name", Alias = "name" }];
        Invalid(() => ReportQueryEngine.Execute(oversized), "Expanded output text budget enforced");
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        try { ReportQueryEngine.Execute(Query(), cancellation.Token); throw new Exception("Cancellation not enforced"); }
        catch (OperationCanceledException) { Console.WriteLine("PASS: Query cancellation"); }
    }

    private static void Check(bool condition, string name)
    {
        if (!condition) throw new InvalidOperationException(name);
        Console.WriteLine($"PASS: {name}");
    }

    private static void Invalid(Action action, string name)
    {
        try { action(); }
        catch (ArgumentException) { Console.WriteLine($"PASS: {name}"); return; }
        throw new InvalidOperationException(name);
    }
}