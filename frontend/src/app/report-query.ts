export type Scalar = string | number | boolean | null;
export interface QuerySource { alias: string; fields: string[]; rows: Record<string, unknown>[]; }
export interface QueryJoin { source: string; kind: 'inner' | 'left'; left: string; right: string; }
export type FilterOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'isNull' | 'notNull';
export interface QueryFilter { field: string; operator: FilterOperator; value: Scalar; }
export type Aggregate = 'none' | 'count' | 'sum' | 'average' | 'min' | 'max';
export interface QuerySelect { field: string; alias: string; aggregate: Aggregate; }
export interface ReportQuery { sources: QuerySource[]; from: string; joins: QueryJoin[]; filters: QueryFilter[]; select: QuerySelect[]; groupBy: string[]; sort: { field: string; descending: boolean }[]; }
export interface QueryResult { columns: { field: string; header: string }[]; rows: Record<string, unknown>[]; inputRows: number; }
export const MAX_JSON_BYTES = 5 * 1024 * 1024;
export const operators: FilterOperator[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'isNull', 'notNull'];
export const aggregates: Aggregate[] = ['none', 'count', 'sum', 'average', 'min', 'max'];
const identifier = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
export function validIdentifier(value: string): boolean { return identifier.test(value) && !['__proto__', 'prototype', 'constructor'].includes(value); }
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function requireValue(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
export function parseJson(text: string): unknown {
  requireValue(new TextEncoder().encode(text).length <= MAX_JSON_BYTES, 'JSON exceeds 5 MB.');
  return JSON.parse(text);
}
export function parseSources(value: unknown, arrayAlias = 'Source'): QuerySource[] {
  const collections = Array.isArray(value) ? { [arrayAlias]: value } : value;
  requireValue(record(collections), 'Choose a JSON array of records or a named object of arrays.');
  const entries = Object.entries(collections);
  requireValue(entries.length > 0 && entries.length <= 8, 'Use 1 to 8 collections.');
  let totalRows = 0;
  let nodes = 0;
  return entries.map(([alias, rows]) => {
    requireValue(validIdentifier(alias), `Invalid source alias: ${alias}. Use letters, digits and underscores, starting with a letter or underscore.`);
    requireValue(Array.isArray(rows), `${alias} must be an array of records.`);
    totalRows += rows.length;
    requireValue(totalRows <= 10000, 'Use at most 10,000 input rows across all sources.');
    const fields = new Set<string>();
    const shapes = new Map<string, 'object' | 'scalar'>();
    const visit = (item: unknown, path: string, depth: number): void => {
      requireValue(++nodes <= 200000, 'JSON exceeds the 200,000-value traversal limit.');
      requireValue(depth <= 8, 'Nested fields exceed 8 levels.');
      requireValue(!Array.isArray(item), `Nested arrays are not supported: ${alias}.${path}.`);
      if (item === null) { fields.add(path); }
      else if (record(item)) {
        requireValue(shapes.get(path) !== 'scalar', `Conflicting object/scalar field: ${alias}.${path}.`);
        shapes.set(path, 'object');
        fields.delete(path);
        for (const [key, child] of Object.entries(item)) {
          requireValue(validIdentifier(key), `Invalid field name: ${key}.`);
          visit(child, path ? `${path}.${key}` : key, depth + 1);
        }
      } else {
        requireValue(['string', 'number', 'boolean'].includes(typeof item) && (typeof item !== 'number' || Number.isFinite(item)), `Invalid scalar: ${alias}.${path}.`);
        requireValue(shapes.get(path) !== 'object', `Conflicting object/scalar field: ${alias}.${path}.`);
        shapes.set(path, 'scalar');
        fields.add(path);
      }
      requireValue(fields.size <= 128 && shapes.size <= 256, `Too many fields in ${alias} (maximum 128 scalar fields).`);
    };
    for (const row of rows) {
      requireValue(record(row), `${alias} must contain records only.`);
      visit(row, '', 0);
    }
    for (const [path, shape] of shapes) if (shape === 'object') fields.delete(path);
    fields.delete('');
    return { alias, fields: [...fields].sort(), rows: rows as Record<string, unknown>[] };
  });
}
export function qualifiedFields(query: ReportQuery): string[] { return query.sources.flatMap(source => source.fields.map(field => `${source.alias}.${field}`)); }
export function fieldSample(query: ReportQuery, field: string): Scalar {
  const [alias, ...path] = field.split('.');
  for (const row of query.sources.find(source => source.alias === alias)?.rows ?? []) {
    let value: unknown = row;
    for (const key of path) value = record(value) ? value[key] : undefined;
    if (value !== null && value !== undefined && !record(value)) return value as Scalar;
  }
  return null;
}
export function parseFilterValue(text: string, mode: 'string' | 'json' | 'auto', sample: Scalar): Scalar {
  if (mode === 'string' || (mode === 'auto' && typeof sample === 'string')) return text;
  const value: unknown = JSON.parse(text);
  requireValue(value === null || ['string', 'boolean', 'number'].includes(typeof value), 'Filter value must be a JSON scalar.');
  requireValue(typeof value !== 'number' || Number.isFinite(value), 'Filter number must be finite.');
  if (mode === 'auto' && sample !== null) requireValue(typeof value === typeof sample, `Expected a ${typeof sample} filter value.`);
  return value as Scalar;
}
export function queryError(query: ReportQuery): string {
  const fields = new Set(qualifiedFields(query));
  const sources = new Set(query.sources.map(source => source.alias));
  if (query.sources.length > 8 || query.joins.length > 7 || query.filters.length > 32 || query.groupBy.length > 32 || query.sort.length > 32 || query.select.length > 256) return 'Query exceeds interactive limits: 8 sources, 7 joins, 32 filters/groups/sorts or 256 output columns.';
  if (query.sources.some(source => !source.fields.length)) return 'Every collection needs at least one scalar field. Empty collections require an explicit schema.';
  if (!sources.size || sources.size !== query.sources.length || !query.sources.every(source => validIdentifier(source.alias))) return 'Add sources with unique, valid aliases.';
  if (!sources.has(query.from)) return 'Choose a starting source.';
  const reachable = new Set([query.from]);
  for (const join of query.joins) {
    if (!sources.has(join.source) || reachable.has(join.source) || !['inner', 'left'].includes(join.kind)) return 'Each join must add a different source.';
    if (!fields.has(join.left) || !fields.has(join.right) || !reachable.has(join.left.split('.')[0]) || join.right.split('.')[0] !== join.source) return 'Join a field from an earlier source to a field in the new source.';
    reachable.add(join.source);
  }
  const available = (field: string) => fields.has(field) && reachable.has(field.split('.')[0]);
  if (!query.select.length) return 'Include at least one output column.';
  const aliases = new Set<string>();
  for (const column of query.select) {
    if (!validIdentifier(column.alias) || aliases.has(column.alias)) return 'Output aliases must be unique identifiers.';
    aliases.add(column.alias);
    if (!aggregates.includes(column.aggregate) || !(column.field === '*' && column.aggregate === 'count') && !available(column.field)) return 'Select fields from the starting source or joined sources.';
    if (['sum', 'average'].includes(column.aggregate) && typeof fieldSample(query, column.field) !== 'number') return 'Sum and average require a numeric field sample.';
  }
  if (query.groupBy.some(field => !available(field)) || new Set(query.groupBy).size !== query.groupBy.length) return 'Choose valid, unique grouping fields.';
  if (query.groupBy.length || query.select.some(column => column.aggregate !== 'none')) {
    if (query.select.some(column => column.aggregate === 'none' && !query.groupBy.includes(column.field))) return 'Group every non-aggregated output field.';
  }
  if (query.filters.some(filter => !available(filter.field) || !operators.includes(filter.operator) || !(filter.value === null || ['string', 'number', 'boolean'].includes(typeof filter.value)))) return 'Choose valid filter fields, operators and scalar values.';
  if (query.sort.some(sort => !aliases.has(sort.field)) || new Set(query.sort.map(sort => sort.field)).size !== query.sort.length) return 'Sort by unique projected output aliases.';
  return '';
}
export function parseQuery(text: string): ReportQuery {
  const value = parseJson(text);
  requireValue(record(value) && Array.isArray(value['sources']) && value['sources'].length <= 8 && typeof value['from'] === 'string', 'Invalid query sources or starting source.');
  const sources = value['sources'].map(source => {
    requireValue(record(source) && typeof source['alias'] === 'string' && Array.isArray(source['fields']) && Array.isArray(source['rows']), 'Invalid query source.');
    const parsed = parseSources(source['rows'], source['alias'])[0];
    requireValue(source['fields'].every(field => typeof field === 'string' && parsed.fields.includes(field)), 'Unknown source field.');
    return parsed;
  });
  requireValue(sources.reduce((sum, source) => sum + source.rows.length, 0) <= 10000, 'Use at most 10,000 input rows.');
  for (const [key, limit] of Object.entries({ joins: 7, filters: 32, select: 256, groupBy: 32, sort: 32 })) requireValue(Array.isArray(value[key]) && value[key].length <= limit, `Invalid ${key} list (maximum ${limit}).`);
  requireValue((value['joins'] as unknown[]).every(item => record(item) && ['source', 'kind', 'left', 'right'].every(key => typeof item[key] === 'string')), 'Invalid join.');
  requireValue((value['select'] as unknown[]).every(item => record(item) && ['field', 'alias', 'aggregate'].every(key => typeof item[key] === 'string')), 'Invalid projection.');
  requireValue((value['filters'] as unknown[]).every(item => record(item) && typeof item['field'] === 'string' && typeof item['operator'] === 'string' && Object.hasOwn(item, 'value')), 'Invalid filter.');
  requireValue((value['groupBy'] as unknown[]).every(item => typeof item === 'string'), 'Invalid grouping field.');
  requireValue((value['sort'] as unknown[]).every(item => record(item) && typeof item['field'] === 'string' && typeof item['descending'] === 'boolean'), 'Invalid sort.');
  const query = { ...value, sources } as unknown as ReportQuery;
  requireValue(!queryError(query), queryError(query));
  return { sources, from: query.from, joins: query.joins, filters: query.filters, select: query.select, groupBy: query.groupBy, sort: query.sort };
}
export function sampleQuery(): ReportQuery {
  return {
    sources: parseSources({
      Customers: [{ Id: 1, Name: 'Sample Customer A' }, { Id: 2, Name: 'Sample Customer B' }],
      Accounts: [{ Id: 101, CustomerId: 1, Currency: 'USD', Balance: 2400 }, { Id: 102, CustomerId: 2, Currency: 'USD', Balance: 850 }],
      Transactions: [{ Id: 1001, AccountId: 101, Amount: 200, Category: 'Deposit' }, { Id: 1002, AccountId: 101, Amount: -50, Category: 'Payment' }, { Id: 1003, AccountId: 102, Amount: 125, Category: 'Deposit' }],
    }),
    from: 'Customers', joins: [{ source: 'Accounts', kind: 'left', left: 'Customers.Id', right: 'Accounts.CustomerId' }], filters: [],
    select: [{ field: 'Customers.Name', alias: 'Customer', aggregate: 'none' }, { field: 'Accounts.Balance', alias: 'Balance', aggregate: 'none' }], groupBy: [], sort: [],
  };
}