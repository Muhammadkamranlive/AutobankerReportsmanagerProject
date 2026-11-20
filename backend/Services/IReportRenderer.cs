using AutobankerReportsManager.Models;

namespace AutobankerReportsManager.Services;

public interface IReportRenderer
{
    byte[] Render(PdfTemplate template, Dictionary<string, object?> data);
    byte[] RenderDataset(QueryResult result);
}