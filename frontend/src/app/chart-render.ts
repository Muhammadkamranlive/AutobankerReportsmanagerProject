import { ChartObjectProps } from './types';

export function resolveData(data: Record<string, unknown>, path: string): unknown {
  return path.replace(/^\{\{\s*|\s*\}\}$/g, '').trim().split('.').reduce<unknown>((value, key) => value && typeof value === 'object' && Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined, data);
}

export function resolveText(text: string, data: Record<string, unknown>): string {
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (original, path: string) => {
    const value = resolveData(data, path);
    return ['string', 'number', 'boolean'].includes(typeof value) ? String(value) : original;
  });
}

export function validateChart(chart: ChartObjectProps): void {
  const bounded = (value: unknown, limit: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
  if (!['bar', 'line', 'donut'].includes(chart.chartType) || typeof chart.title !== 'string' || chart.title.length > 80 || !bounded(chart.dataSource, 128) || !bounded(chart.labelField, 128)) throw new Error('Invalid chart type, title or binding.');
  if (!Array.isArray(chart.series) || chart.series.length < 1 || chart.series.length > 4 || (chart.chartType === 'donut' && chart.series.length !== 1)) throw new Error('Charts need 1-4 series; donuts need exactly one.');
  if (!chart.series.every(series => series && bounded(series.field, 128) && bounded(series.label, 32) && /^#[0-9a-f]{6}$/i.test(series.color))) throw new Error('Invalid chart series field, label or hex color.');
}

const escapeXml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
const short = (value: string, limit: number) => value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
const compact = (value: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

export function buildChartSvg(chart: ChartObjectProps, rows: unknown): string {
  const width = Math.max(240, Number.isFinite(chart.width) ? chart.width : 460);
  const height = Math.max(180, Number.isFinite(chart.height) ? chart.height : 240);
  const parts: string[] = [];
  const text = (value: string, left: number, top: number, size = 10, anchor = 'start', color = '#36443f') => `<text x="${left}" y="${top}" font-size="${size}" text-anchor="${anchor}" fill="${color}">${escapeXml(value)}</text>`;
  try {
    validateChart(chart);
    parts.push(text(short(chart.title, Math.floor(width / 7)), 12, 21, 13));
    if (!Array.isArray(rows)) throw new Error('Data source is not a collection');
    if (rows.length > 20) throw new Error('Limit exceeded: 20 categories');
    if (!rows.length) throw new Error('No data');
    const labels = rows.map(row => {
      const label = row && typeof row === 'object' && !Array.isArray(row) ? row[chart.labelField] : undefined;
      if (typeof label !== 'string' && typeof label !== 'number') throw new Error('Missing category labels');
      if (typeof label === 'number' && !Number.isFinite(label)) throw new Error('Invalid category label');
      return String(label);
    });
    const values = rows.map(row => chart.series.map(series => {
      const value = row[series.field];
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Series values must be finite numbers');
      if (chart.chartType === 'donut' && value < 0) throw new Error('Donut values must be nonnegative');
      return value;
    }));
    if (chart.chartType === 'donut') {
      const total = values.reduce((sum, row) => sum + row[0], 0);
      if (!Number.isFinite(total)) throw new Error('Values exceed numeric range');
      if (!total) throw new Error('No nonzero data');
      const radius = Math.min((height - 65) / 2, width * .22);
      const centerX = width * .27;
      const centerY = (height + 30) / 2;
      const palette = ['#16845b', '#087f8c', '#e16b58', '#367ac4', '#b58a14', '#7b62a3', '#3c9c89', '#c05472', '#53764b', '#547f9f', '#9c6e28', '#8e657b'];
      let offset = 0;
      values.forEach((row, index) => {
        const fraction = row[0] / total;
        const color = index === 0 ? chart.series[0].color : palette[index % palette.length];
        parts.push(`<circle cx="${centerX}" cy="${centerY}" r="${radius * .73}" fill="none" stroke="${color}" stroke-width="${radius * .42}" stroke-dasharray="${fraction * Math.PI * radius * 1.46} ${Math.PI * radius * 1.46}" transform="rotate(${offset * 360 - 90} ${centerX} ${centerY})"/>`);
        const column = index % 2;
        const left = width * .53 + column * width * .23;
        const top = 56 + Math.floor(index / 2) * Math.min(20, (height - 65) / Math.ceil(rows.length / 2));
        parts.push(`<rect x="${left}" y="${top - 8}" width="7" height="7" fill="${color}"/>`, text(`${short(labels[index], 8)} ${Math.round(fraction * 100)}%`, left + 10, top, 9));
        offset += fraction;
      });
      parts.push(text(compact(total), centerX, centerY + 4, 14, 'middle'));
    } else {
      const left = 51, top = 41, right = width - 12, bottom = height - 58;
      const minimum = Math.min(0, ...values.flat()), maximum = Math.max(0, ...values.flat());
      const range = maximum - minimum || 1;
      if (!Number.isFinite(range)) throw new Error('Values exceed numeric range');
      const ordinate = (value: number) => bottom - (value - minimum) / range * (bottom - top);
      const baseline = ordinate(0), step = (right - left) / rows.length;
      for (let tick = 0; tick <= 4; tick++) {
        const value = minimum + range * tick / 4, position = ordinate(value);
        parts.push(`<path d="M${left} ${position}H${right}" stroke="#e1e7e4"/>`, text(compact(value), left - 6, position + 3, 9, 'end'));
      }
      parts.push(`<path data-baseline="true" d="M${left} ${baseline}H${right}" stroke="#64746c"/>`);
      labels.forEach((label, index) => parts.push(text(short(label, Math.max(3, Math.floor(step / 5.2))), left + step * (index + .5), bottom + 16, 9, 'middle')));
      chart.series.forEach((series, seriesIndex) => {
        if (chart.chartType === 'line') {
          parts.push(`<polyline points="${values.map((row, index) => `${left + step * (index + .5)},${ordinate(row[seriesIndex])}`).join(' ')}" fill="none" stroke="${series.color}" stroke-width="2"/>`);
          values.forEach((row, index) => parts.push(`<circle cx="${left + step * (index + .5)}" cy="${ordinate(row[seriesIndex])}" r="2.5" fill="${series.color}"/>`));
        } else {
          const barWidth = step * .76 / chart.series.length;
          values.forEach((row, index) => parts.push(`<rect data-value="${row[seriesIndex]}" x="${left + step * index + step * .12 + seriesIndex * barWidth}" y="${Math.min(baseline, ordinate(row[seriesIndex]))}" width="${barWidth * .88}" height="${Math.abs(ordinate(row[seriesIndex]) - baseline)}" fill="${series.color}"/>`));
        }
        const legendWidth = (width - 24) / chart.series.length, legendLeft = 12 + legendWidth * seriesIndex;
        parts.push(`<rect x="${legendLeft}" y="${height - 17}" width="8" height="8" fill="${series.color}"/>`, text(short(series.label, Math.floor((legendWidth - 16) / 5.5)), legendLeft + 13, height - 9, 9));
      });
    }
  } catch (error) {
    parts.length = 0;
    parts.push(text(short(typeof chart.title === 'string' ? chart.title : 'Chart', Math.floor(width / 7)), 12, 21, 13), text(short(error instanceof Error ? error.message : 'Invalid chart', Math.floor(width / 6)), width / 2, height / 2, 11, 'middle'));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Helvetica,Arial,sans-serif"><rect width="100%" height="100%" fill="#ffffff"/>${parts.join('')}</svg>`;
}