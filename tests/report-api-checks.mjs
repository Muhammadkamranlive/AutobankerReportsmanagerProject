import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';

function zipEntries(bytes) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'ZIP end record exists');
  const count = bytes.readUInt16LE(end + 10);
  let position = bytes.readUInt32LE(end + 16);
  const entries = new Map();
  for (let index = 0; index < count; index++) {
    assert.equal(bytes.readUInt32LE(position), 0x02014b50);
    const method = bytes.readUInt16LE(position + 10);
    const length = bytes.readUInt32LE(position + 20);
    const nameLength = bytes.readUInt16LE(position + 28);
    const name = bytes.subarray(position + 46, position + 46 + nameLength).toString();
    const local = bytes.readUInt32LE(position + 42);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const compressed = bytes.subarray(start, start + length);
    assert.ok(method === 0 || method === 8);
    entries.set(name, method === 8 ? inflateRawSync(compressed) : compressed);
    position += 46 + nameLength + bytes.readUInt16LE(position + 30) + bytes.readUInt16LE(position + 32);
  }
  return entries;
}

const base = process.env.REPORT_API_URL ?? 'http://127.0.0.1:5081';
const query = {
  sources: [
    { alias: 'Customers', fields: ['Id', 'Name'], rows: [{ Id: 1, Name: 'Ada' }, { Id: 2, Name: 'Lin' }] },
    { alias: 'Accounts', fields: ['CustomerId', 'Amount'], rows: [{ CustomerId: 1, Amount: 10.25 }, { CustomerId: 1, Amount: 20.75 }] },
  ],
  from: 'Customers',
  joins: [{ source: 'Accounts', kind: 'left', left: 'Customers.Id', right: 'Accounts.CustomerId' }],
  select: [{ field: 'Customers.Name', alias: 'Customer', aggregate: 'none' }, { field: 'Accounts.Amount', alias: 'Amount', aggregate: 'sum' }],
  groupBy: ['Customers.Name'], sort: [{ field: 'Customer', descending: false }], filters: [],
};
async function post(route, body = query) {
  return fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
const response = await post('/api/reports/query');
assert.equal(response.status, 200, await response.clone().text());
const result = await response.json();
assert.deepEqual(result.rows, [{ Customer: 'Ada', Amount: 31 }, { Customer: 'Lin', Amount: 0 }]);
assert.equal(result.inputRows, 4);
console.log('PASS: live grouped LEFT join, decimal total and unmatched customer');
for (const [format, route, mime, signature] of [
  ['csv', '/api/reports/export/csv', 'text/csv', '"Customer","Amount"'],
  ['xlsx', '/api/reports/export/xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'PK'],
  ['pdf', '/api/reports/query/pdf', 'application/pdf', '%PDF-'],
  ['docx', '/api/reports/export/docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'PK'],
]) {
  const artifact = await post(route);
  assert.equal(artifact.status, 200, await artifact.clone().text());
  assert.ok(artifact.headers.get('content-type')?.startsWith(mime));
  assert.ok(artifact.headers.get('content-disposition')?.includes(`report.${format}`));
  const bytes = Buffer.from(await artifact.arrayBuffer());
  assert.ok(bytes.subarray(0, signature.length).toString().startsWith(signature));
  if (format === 'csv') assert.match(bytes.toString(), /"Ada","31(?:\.0+)?"/);
  console.log(`PASS: live ${format.toUpperCase()} artifact (${bytes.length} bytes)`);
}
const bundleResponse = await post('/api/reports/export/all');
assert.equal(bundleResponse.status, 200, await bundleResponse.clone().text());
assert.ok(bundleResponse.headers.get('content-type')?.startsWith('application/zip'));
const bundle = zipEntries(Buffer.from(await bundleResponse.arrayBuffer()));
assert.deepEqual([...bundle.keys()].sort(), ['manifest.json', 'report.csv', 'report.docx', 'report.pdf', 'report.xlsx']);
const manifest = JSON.parse(bundle.get('manifest.json').toString());
assert.equal(manifest.rowCount, result.rows.length);
assert.equal(manifest.inputRowCount, result.inputRows);
assert.deepEqual(manifest.columns, result.columns);
assert.match(manifest.exportId, /^[0-9a-f]{32}$/);
assert.ok(Number.isFinite(Date.parse(manifest.createdAtUtc)));
assert.equal(manifest.files.length, 4);
for (const file of manifest.files) {
  const bytes = bundle.get(file.name);
  assert.equal(bytes.length, file.sizeBytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
}
assert.match(bundle.get('report.csv').toString(), /"Ada","31(?:\.0+)?"/);
const document = zipEntries(bundle.get('report.docx')).get('word/document.xml').toString();
const worksheet = zipEntries(bundle.get('report.xlsx')).get('xl/worksheets/sheet1.xml').toString();
for (const value of ['Ada', 'Lin']) {
  assert.ok(document.includes(`>${value}<`));
  assert.ok(worksheet.includes(`>${value}<`));
}
assert.equal((document.match(/<w:tr>/g) ?? []).length, result.rows.length + 1);
assert.equal((worksheet.match(/<row /g) ?? []).length, result.rows.length + 1);
assert.ok(bundle.get('report.pdf').subarray(0, 5).toString() === '%PDF-');
console.log('PASS: one-result four-format bundle, matching Word/Excel/CSV rows and manifest SHA-256 checksums');
const wide = { ...query, select: Array.from({ length: 13 }, (_, index) => ({ field: 'Customers.Name', alias: `Column${index}`, aggregate: 'none' })), groupBy: [], sort: [] };
for (const format of ['docx', 'pdf', 'all']) {
  const invalid = await post(`/api/reports/export/${format}`, wide);
  assert.equal(invalid.status, 400);
}
assert.equal((await post('/api/reports/export/unknown')).status, 400);
console.log('PASS: Word/PDF/bundle readability limits and unsupported formats rejected');
for (const change of [
  { select: [{ field: 'Unknown', alias: 'bad', aggregate: 'none' }] },
  { from: null },
  { joins: [{ source: null }] },
  { filters: null },
  { select: [null] },
]) {
  const invalid = await post('/api/reports/query', { ...query, ...change });
  assert.equal(invalid.status, 400, await invalid.clone().text());
  assert.ok(invalid.headers.get('content-type')?.includes('json'));
}
console.log('PASS: malformed query requests return 400, not server errors');
const canvasPdf = await post('/api/pdf/generate', {
  template: {
    name: 'Bound report', page: { width: 595, height: 842 },
    objects: [{ id: 'table', type: 'table', x: 36, y: 52, width: 523, height: 140,
      dataSource: 'ReportRows', columns: [{ id: 'Customer', field: 'Customer', header: 'Customer', width: 261.5 },
        { id: 'Amount', field: 'Amount', header: 'Amount', width: 261.5 }] }],
  }, data: { ReportRows: result.rows },
});
assert.equal(canvasPdf.status, 200, await canvasPdf.clone().text());
assert.ok(Buffer.from(await canvasPdf.arrayBuffer()).subarray(0, 5).toString() === '%PDF-');
console.log('PASS: legacy canvas PDF renders bound query rows');
const large = {
  sources: [{ alias: 'Rows', fields: ['Id', 'Amount'], rows: Array.from({ length: 1000 }, (_, index) => ({ Id: `ROW_${index}`, Amount: index })) }],
  from: 'Rows', select: [{ field: 'Rows.Id', alias: 'Id', aggregate: 'none' }, { field: 'Rows.Amount', alias: 'Amount', aggregate: 'none' }],
};
const longPdf = await post('/api/reports/query/pdf', large);
assert.equal(longPdf.status, 200, await longPdf.clone().text());
const pdf = Buffer.from(await longPdf.arrayBuffer()).toString('latin1');
const pages = [...pdf.matchAll(/\/Type\s*\/Page\b/g)].length;
assert.ok(pages > 1, `Expected a multi-page PDF, found ${pages} page objects`);
console.log(`PASS: 1,000-row PDF flows across ${pages} pages`);
for (const chartType of ['bar', 'line', 'donut']) {
  const chartResponse = await post('/api/pdf/generate', {
    template: { name: `Chart ${chartType}`, page: { width: 842, height: 595 }, objects: [{
      id: 'chart', type: 'chart', x: 24, y: 24, width: 700, height: 400,
      chartType, title: 'Synthetic branch activity', dataSource: 'Branches', labelField: 'branch',
      series: [{ field: 'accounts', label: 'Accounts', color: '#16845b' }],
    }] },
    data: { Branches: [{ branch: 'B01', accounts: 580 }, { branch: 'B02', accounts: 640 }] },
  });
  assert.equal(chartResponse.status, 200, await chartResponse.clone().text());
  const bytes = Buffer.from(await chartResponse.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(bytes.length > 1000);
  console.log(`PASS: native ${chartType} chart PDF (${bytes.length} bytes)`);
}
console.log('All live report API checks passed.');