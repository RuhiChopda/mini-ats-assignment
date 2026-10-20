const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../src/app');
const { openDb } = require('../src/db');

let server, base;
test.before(async () => {
  const app = createApp(openDb(':memory:'));
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const call = async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
};
const mk = (o = {}) => ({ name: 'Ada Lovelace', email: 'ada@example.com', position: 'Backend Engineer', skills: 'Node.js, SQL', experience_years: 6, ...o });

test('create + validation + duplicate email', async () => {
  assert.strictEqual((await call('POST', '/api/candidates', { name: '' })).status, 400);
  const ok = await call('POST', '/api/candidates', mk());
  assert.strictEqual(ok.status, 201);
  assert.strictEqual(ok.body.stage, 'Applied');
  assert.strictEqual((await call('POST', '/api/candidates', mk())).status, 409);
});

test('stage change records history and rejects invalid stage', async () => {
  const { body: c } = await call('POST', '/api/candidates', mk({ email: 'g@example.com', name: 'Grace Hopper' }));
  assert.strictEqual((await call('PATCH', `/api/candidates/${c.id}`, { stage: 'Nope' })).status, 400);
  const up = await call('PATCH', `/api/candidates/${c.id}`, { stage: 'Interview' });
  assert.strictEqual(up.body.stage, 'Interview');
  const d = await call('GET', `/api/candidates/${c.id}`);
  assert.deepStrictEqual(d.body.history.map((h) => h.to_stage), ['Applied', 'Interview']);
});

test('search and filters', async () => {
  await call('POST', '/api/candidates', mk({ email: 'd@example.com', name: 'Dana Designer', position: 'Product Designer', skills: 'Figma', experience_years: 2 }));
  const s = await call('GET', '/api/candidates?q=figma');
  assert.strictEqual(s.body.total, 1);
  const f = await call('GET', '/api/candidates?position=Backend%20Engineer&min_exp=5');
  assert.ok(f.body.data.every((c) => c.position === 'Backend Engineer' && c.experience_years >= 5));
});

test('notes add/delete and candidate delete cascades', async () => {
  const { body: c } = await call('POST', '/api/candidates', mk({ email: 'n@example.com', name: 'Note Taker' }));
  const n = await call('POST', `/api/candidates/${c.id}/notes`, { body: 'Great call' });
  assert.strictEqual(n.status, 201);
  assert.strictEqual((await call('POST', `/api/candidates/${c.id}/notes`, { body: ' ' })).status, 400);
  assert.strictEqual((await call('GET', `/api/candidates/${c.id}`)).body.notes.length, 1);
  assert.strictEqual((await call('DELETE', `/api/candidates/${c.id}`)).status, 204);
  assert.strictEqual((await call('GET', `/api/candidates/${c.id}`)).status, 404);
});

test('dashboard metrics', async () => {
  const { body: c } = await call('POST', '/api/candidates', mk({ email: 'h@example.com', name: 'Hire Me' }));
  await call('PATCH', `/api/candidates/${c.id}`, { stage: 'Hired' });
  const d = (await call('GET', '/api/dashboard')).body;
  assert.ok(d.total >= 4);
  assert.ok(d.hired >= 1);
  assert.strictEqual(d.active, d.total - d.hired - d.rejected);
  assert.strictEqual(Object.keys(d.byStage).length, 6);
  assert.ok(d.avgDaysToHire !== null);
});
