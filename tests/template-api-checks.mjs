import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

const base = process.env.REPORT_API_URL ?? 'http://127.0.0.1:5081';
async function request(path, method = 'GET', body) {
  return fetch(`${base}/api/templates${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}
function unzip(bytes) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0);
  const entries = new Map();
  let position = bytes.readUInt32LE(end + 16);
  for (let index = 0; index < bytes.readUInt16LE(end + 10); index++) {
    const nameLength = bytes.readUInt16LE(position + 28);
    const name = bytes.subarray(position + 46, position + 46 + nameLength).toString();
    const local = bytes.readUInt32LE(position + 42);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const compressed = bytes.subarray(start, start + bytes.readUInt32LE(position + 20));
    entries.set(name, bytes.readUInt16LE(position + 10) === 8 ? inflateRawSync(compressed) : compressed);
    position += 46 + nameLength + bytes.readUInt16LE(position + 30) + bytes.readUInt16LE(position + 32);
  }
  return entries;
}
const common = { x: 30, y: 30, width: 450, height: 24, rotation: 0, hidden: false, locked: false, region: 'body' };
const template = {
  version: '1.0', name: 'Template export verification',
  page: { size: 'A4', orientation: 'portrait', width: 595, height: 842, margins: { top: 20, right: 20, bottom: 20, left: 20 } },
  objects: [
    { ...common, id: 'title', type: 'text', name: 'Summary', text: 'Accounts: {{Accounts}}', fontSize: 14, color: '#123456' },
    { ...common, id: 'table', type: 'table', name: 'Branches', y: 70, height: 120, dataSource: 'Branches', columns: [
      { id: 'name', field: 'name', header: 'Branch', width: 225, align: 'left' },
      { id: 'amount', field: 'amount', header: 'Balance', width: 225, align: 'right' },
    ] },
    { ...common, id: 'chart', type: 'chart', name: 'Balances', y: 230, height: 210, chartType: 'bar', title: 'Branch balances', dataSource: 'Branches', labelField: 'name', series: [{ field: 'amount', label: 'Balance', color: '#16845b' }] },
    { ...common, id: 'hidden', type: 'text', hidden: true, text: 'HIDDEN_SENTINEL' },
  ],
};
const sample = { Accounts: 7020, Branches: [{ name: 'Central', amount: 123.45 }, { name: 'Airport', amount: 678.9 }] };
const created = await request('', 'POST', template);
assert.equal(created.status, 201, await created.clone().text());
const saved = await created.json();
assert.match(saved.id, /^[a-f0-9]{32}$/);
assert.deepEqual(saved.template, template);
assert.ok((await (await request('')).json()).some(item => item.id === saved.id));
assert.deepEqual((await (await request(`/${saved.id}`)).json()).template, template);
const updated = await request(`/${saved.id}`, 'PUT', { ...template, name: template.name + ' updated' });
assert.equal(updated.status, 200);
assert.equal((await updated.json()).id, saved.id);
const response = await request(`/${saved.id}/generate`, 'POST', sample);
assert.equal(response.status, 200, await response.clone().text());
const generated = await response.json();
const files = new Map(generated.files.map(file => [file.format, Buffer.from(file.base64, 'base64')]));
assert.deepEqual([...files.keys()].sort(), ['csv', 'docx', 'pdf', 'xlsx', 'zip']);
assert.equal(generated.dataSha256, createHash('sha256').update(JSON.stringify(sample)).digest('hex'));
const csv = files.get('csv').toString();
const word = unzip(files.get('docx')).get('word/document.xml').toString();
const excel = unzip(files.get('xlsx')).get('xl/worksheets/sheet1.xml').toString();
for (const value of ['Accounts: 7020', 'Central', 'Airport', '123.45', '678.9', 'Branch balances']) {
  for (const content of [csv, word, excel]) assert.ok(content.includes(value), `All data exports include ${value}`);
}
for (const content of [csv, word, excel]) assert.ok(!content.includes('HIDDEN_SENTINEL'));
assert.equal(files.get('pdf').subarray(0, 5).toString(), '%PDF-');
const bundle = unzip(files.get('zip'));
for (const format of ['csv', 'xlsx', 'docx', 'pdf']) assert.deepEqual(bundle.get(`report.${format}`), files.get(format));
assert.deepEqual(JSON.parse(bundle.get('sample-data.json')), sample);
const manifest = JSON.parse(bundle.get('manifest.json'));
assert.equal(manifest.dataSha256, generated.dataSha256);
for (const file of manifest.files) assert.equal(createHash('sha256').update(bundle.get(file.name)).digest('hex'), file.sha256);
assert.equal((await request('', 'POST', { name: 'Invalid' })).status, 400);
assert.equal((await request('', 'POST', { ...template, objects: [null] })).status, 400);
assert.equal((await request('', 'POST', { ...template, objects: [{ ...common, type: 'unsupported' }] })).status, 400);
assert.equal((await request('', 'POST', { ...template, objects: [{ ...common, type: 'table', columns: null }] })).status, 400);
assert.equal((await request('/not-a-template-id')).status, 400);
assert.equal((await request('/00000000000000000000000000000000')).status, 404);
assert.equal((await request('/00000000000000000000000000000000/generate', 'POST', sample)).status, 404);
assert.equal((await request(`/${saved.id}/generate`, 'POST', [])).status, 400);
console.log(`PASS: disk save/list/load/update, single-snapshot PDF/CSV/Excel/Word, identical ZIP artifacts, checksum manifest and invalid requests (${saved.id})`);