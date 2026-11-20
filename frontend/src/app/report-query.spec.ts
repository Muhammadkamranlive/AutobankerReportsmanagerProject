import { fieldSample, parseFilterValue, parseQuery, parseSources, queryError, sampleQuery } from './report-query';

describe('report query validation', () => {
  it('discovers deterministic nested scalar paths across all records', () => {
    const sources = parseSources([{ z: null, profile: { name: 'A' } }, { a: 2, profile: { active: true } }], 'People');
    expect(sources[0].fields).toEqual(['a', 'profile.active', 'profile.name', 'z']);
    expect(fieldSample({ ...sampleQuery(), sources }, 'People.profile.active')).toBe(true);
  });
  it('rejects invalid aliases, unsafe paths, nested arrays and scalar/object conflicts', () => {
    for (const value of [{ 'not-valid': [] }, [{ items: [1] }], JSON.parse('[{"__proto__":1}]'), [{ field: 1 }, { field: { child: 2 } }], [1]]) {
      expect(() => parseSources(value)).toThrow();
    }
  });
  it('bounds rows, nesting and fields', () => {
    expect(() => parseSources(Array.from({ length: 10001 }, () => ({})))).toThrow('10,000');
    expect(() => parseSources([Object.fromEntries(Array.from({ length: 129 }, (_, index) => [`f${index}`, index]))])).toThrow('fields');
    let nested: unknown = 1;
    for (let depth = 0; depth < 9; depth++) nested = { child: nested };
    expect(() => parseSources([nested])).toThrow('8 levels');
  });
  it('handles null parents consistently regardless of record order', () => {
    expect(parseSources([{ a: { b: 1 } }, { a: null }])[0].fields).toEqual(['a.b']);
    expect(parseSources([{ a: null }, { a: { b: 1 } }])[0].fields).toEqual(['a.b']);
  });
  it('parses explicit string and typed JSON scalar filter values', () => {
    expect(parseFilterValue('001', 'auto', 'sample')).toBe('001');
    expect(parseFilterValue('false', 'auto', true)).toBe(false);
    expect(parseFilterValue('10.5', 'auto', 1)).toBe(10.5);
    expect(parseFilterValue('null', 'json', 'sample')).toBeNull();
    expect(() => parseFilterValue('{}', 'json', null)).toThrow('scalar');
    expect(() => parseFilterValue('"12"', 'auto', 1)).toThrow('number');
  });
  it('validates joins, grouping and projected sorting aliases', () => {
    const query = sampleQuery();
    expect(queryError(query)).toBe('');
    query.sort = [{ field: 'Accounts.Balance', descending: false }];
    expect(queryError(query)).toContain('output aliases');
    query.sort = [];
    query.select[1].aggregate = 'sum';
    expect(queryError(query)).toContain('Group');
    query.groupBy = ['Customers.Name'];
    expect(queryError(query)).toBe('');
    query.joins[0].right = 'Customers.Id';
    expect(queryError(query)).toContain('Join a field');
  });
  it('round-trips saved query JSON and rejects malformed imports', () => {
    expect(parseQuery(JSON.stringify(sampleQuery()))).toEqual(sampleQuery());
    expect(() => parseQuery('{"sources":[null]}')).toThrow();
    expect(() => parseQuery(JSON.stringify({ ...sampleQuery(), select: [null] }))).toThrow('projection');
  });
  it('aligns source, identifier and operation limits with the server', () => {
    expect(() => parseSources(Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`Source${index}`, [{ value: 1 }]])))).toThrow('8 collections');
    expect(() => parseSources([{ ['a'.repeat(65)]: 1 }])).toThrow('field name');
    const query = sampleQuery();
    query.filters = Array.from({ length: 33 }, () => ({ field: 'Accounts.Balance', operator: 'gte' as const, value: 0 }));
    expect(queryError(query)).toContain('interactive limits');
    expect(() => parseQuery(JSON.stringify(query))).toThrow('maximum 32');
  });
});