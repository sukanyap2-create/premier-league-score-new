const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
process.env.FOOTBALL_DATA_BACKUP_PATH = path.join(
  os.tmpdir(),
  `football-dashboard-server-tests-${process.pid}-${Date.now()}.json`
);
const app = require('./server');

test('match filters reject invalid input before proxying upstream', async t => {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  }));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const invalidFilters = [
    ['matchday=0', 'matchday'],
    ['limit=101', 'limit'],
    ['offset=-1', 'offset'],
    ['status=INVALID', 'สถานะการแข่งขัน'],
    ['dateFrom=2026-02-30', 'วันที่เริ่มต้น'],
    ['dateFrom=2026-10-10&dateTo=2026-10-01', 'วันที่เริ่มต้น'],
    ['unknown=value', 'ตัวกรอง'],
    ['status=FINISHED&status=LIVE', 'รูปแบบตัวกรอง']
  ];

  for (const [query, expectedMessage] of invalidFilters) {
    const response = await fetch(`${baseUrl}/api/matches?${query}`);
    assert.equal(response.status, 400, query);
    const body = await response.json();
    assert.match(body.error, new RegExp(expectedMessage), query);
  }
});

test('competition and area query parameters are validated', async t => {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  }));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const invalidRoutes = [
    ['/api/competitions/PL/standings?season=20xx', 'season'],
    ['/api/areas?ids=abc', 'ids'],
    ['/api/competitions/INVALID%21/teams', 'รหัสการแข่งขัน']
  ];

  for (const [route, expectedMessage] of invalidRoutes) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 400, route);
    const body = await response.json();
    assert.match(body.error, new RegExp(expectedMessage), route);
  }
});

test('API routes are restricted to Premier League data', async t => {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  }));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const unsupportedRoutes = [
    '/api/competitions/PD',
    '/api/competitions/PD/standings',
    '/api/competitions/PD/teams',
    '/api/competitions/PD/matches'
  ];

  for (const route of unsupportedRoutes) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 404, route);
    assert.match((await response.json()).error, /Premier League/);
  }

  const mixedCompetitionQueries = [
    '/api/competitions?codes=PL,PD',
    '/api/matches?competitions=PL,PD',
    '/api/teams/65/matches?competitions=PL,PD'
  ];
  for (const route of mixedCompetitionQueries) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 400, route);
    assert.match((await response.json()).error, /Premier League/);
  }
});

test('only free-plan competition data routes are exposed', async t => {
  const savedToken = process.env.FOOTBALL_DATA_TOKEN;
  delete process.env.FOOTBALL_DATA_TOKEN;
  t.after(() => {
    if (savedToken === undefined) delete process.env.FOOTBALL_DATA_TOKEN;
    else process.env.FOOTBALL_DATA_TOKEN = savedToken;
  });

  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  }));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const standings = await fetch(`${baseUrl}/api/competitions/PL/standings`);
  assert.equal(standings.status, 503);
  assert.equal((await standings.json()).error, 'ยังไม่ได้ตั้งค่า FOOTBALL_DATA_TOKEN บนเซิร์ฟเวอร์');

  const supportedRoutes = [
    '/api/competitions',
    '/api/areas',
    '/api/standings',
    '/api/matches',
    '/api/competitions/PL',
    '/api/competitions/PL/teams',
    '/api/competitions/PL/matches',
    '/api/teams/65',
    '/api/teams/65/matches',
    '/api/matches/123',
    '/api/matches/123/head2head'
  ];
  for (const route of supportedRoutes) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 503, route);
  }

  const unavailableRoutes = ['/api/scorers'];
  for (const route of unavailableRoutes) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 404, route);
  }
});
