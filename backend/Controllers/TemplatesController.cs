using System.Text.Json;
using AutobankerReportsManager.Services;
using Microsoft.AspNetCore.Mvc;

namespace AutobankerReportsManager.Controllers;

[ApiController]
[Route("api/templates")]
[RequestSizeLimit(6 * 1024 * 1024)]
public sealed class TemplatesController(TemplateRepository repository, IReportRenderer renderer, ILogger<TemplatesController> logger) : ControllerBase
{
    [HttpGet]
    public IActionResult List() => Execute(() => Ok(repository.List()));

    [HttpGet("{id}")]
    public IActionResult Get(string id) => Execute(() => repository.Get(id) is { } saved ? Ok(saved) : NotFound());

    [HttpPost]
    public IActionResult Create([FromBody] JsonElement template) => Execute(() =>
    {
        var saved = repository.Save(template);
        return CreatedAtAction(nameof(Get), new { id = saved.Id }, saved);
    });

    [HttpPut("{id}")]
    public IActionResult Update(string id, [FromBody] JsonElement template) => Execute(() =>
        repository.Get(id) is null ? NotFound() : Ok(repository.Save(template, id)));

    [HttpPost("{id}/generate")]
    public IActionResult Generate(string id, [FromBody] JsonElement data, CancellationToken cancellationToken) => Execute(() =>
        repository.Get(id) is { } saved
            ? Ok(TemplateTestExporter.Generate(saved, data, renderer, cancellationToken)) : NotFound());

    private IActionResult Execute(Func<IActionResult> action)
    {
        try { return action(); }
        catch (Exception error) when (error is ArgumentException or JsonException)
        { return Problem(statusCode: 400, title: "Invalid template", detail: error.Message); }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            logger.LogError(error, "Template storage is unavailable");
            return Problem(statusCode: 503, title: "Template storage is unavailable", detail: "Check the server template folder and its permissions.");
        }
    }
}