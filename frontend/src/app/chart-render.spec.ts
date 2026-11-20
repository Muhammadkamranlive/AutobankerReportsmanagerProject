import { buildChartSvg, resolveText } from './chart-render';
import { makeObject } from './object-factory';
import { ChartObjectProps } from './types';

describe('native chart SVG', () => {
  const chart = (patch = {}) => makeObject('chart', patch) as ChartObjectProps;
  it('renders signed grouped bars and a zero baseline deterministically', () => {
    const item = chart({ series: [{ field: 'amount', label: 'Amount', color: '#16845b' }] });
    const rows = [{ branchCode: 'A', amount: -20 }, { branchCode: 'B', amount: 40 }];
    const svg = buildChartSvg(item, rows);
    expect(svg).toContain('data-baseline="true"');
    expect(svg).toContain('data-value="-20"');
    expect(svg).not.toMatch(/NaN|Infinity|height="-/);
    expect(buildChartSvg(item, rows)).toBe(svg);
  });
  it('escapes XML, renders lines and does not invent data', () => {
    const svg = buildChartSvg(chart({ chartType: 'line', title: '<script>&' }), [{ branchCode: 'A', accountsOpened: 5 }]);
    expect(svg).toContain('&lt;script&gt;&amp;');
    expect(svg).toContain('<polyline');
    expect(buildChartSvg(chart(), [])).toContain('No data');
    expect(buildChartSvg(chart(), undefined)).toContain('not a collection');
    expect(buildChartSvg(chart(), [{ branchCode: 'A', accountsOpened: NaN }])).toContain('finite numbers');
    expect(buildChartSvg(chart(), Array(21).fill({}))).toContain('20 categories');
  });
  it('accepts only nonnegative single-series donuts', () => {
    expect(buildChartSvg(chart({ chartType: 'donut' }), [{ branchCode: 'A', accountsOpened: 5 }])).toContain('stroke-dasharray');
    expect(buildChartSvg(chart({ chartType: 'donut' }), [{ branchCode: 'A', accountsOpened: -1 }])).toContain('nonnegative');
    expect(buildChartSvg(chart({ chartType: 'donut' }), [{ branchCode: 'A', accountsOpened: 0 }])).toContain('No nonzero data');
  });
  it('resolves scalar placeholders without modifying the input', () => {
    const text = '{{Date}} {{Totals.count}} {{Unknown}}';
    expect(resolveText(text, { Date: '2026-10-28', Totals: { count: 6000 } })).toBe('2026-10-28 6000 {{Unknown}}');
    expect(text).toContain('{{Date}}');
  });
});