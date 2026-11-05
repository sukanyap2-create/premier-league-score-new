const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const backupPath = path.join(os.tmpdir(), `football-dashboard-backup-${process.pid}-${Date.now()}.json`);
const serverModulePath = require.resolve('./server');
const savedToken = process.env.FOOTBALL_DATA_TOKEN;
const savedBackupPath = process.env.FOOTBALL_DATA_BACKUP_PATH;
const originalFetch = global.fetch;
process.env.FOOTBALL_DATA_TOKEN = 'test-token';
process.env.FOOTBALL_DATA_BACKUP_PATH = backupPath;

let app = require('./server');
let server;

function listen(application) {
  return new Promise(resolve => {
    const instance = application.listen(0, () => resolve(instance));
  });
}

function close(instance) {
  return new Promise((resolve, reject) => {
    instance.close(error => error ? reject(error) : resolve());
  });
}

test('serves persisted API data with a stale marker when the upstream is unavailable', async t => {
  const savedResponse = {
    competition: { code: 'PL', name: 'Premier League' },
    standings: [{ type: 'TOTAL', table: [{ position: 1, points: 99 }] }]
  };
  let upstreamCalls = 0;
  global.fetch = async () => {
    upstreamCalls += 1;
    return { ok: true, status: 200, json: async () => savedResponse };
  };

  t.after(async () => {
    if (server?.listening) await close(server);
    global.fetch = originalFetch;
    if (savedToken === undefined) delete process.env.FOOTBALL_DATA_TOKEN;
    else process.env.FOOTBALL_DATA_TOKEN = savedToken;
    if (savedBackupPath === undefined) delete process.env.FOOTBALL_DATA_BACKUP_PATH;
    else process.env.FOOTBALL_DATA_BACKUP_PATH = savedBackupPath;
    delete require.cache[serverModulePath];
    try {
      await fs.unlink(backupPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  });

  server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const route = '/api/competitions/PL/standings?season=2099';
  const freshResponse = await originalFetch(`${baseUrl}${route}`);
  assert.equal(freshResponse.status, 200);
  assert.equal(freshResponse.headers.get('x-data-source'), 'live');
  assert.deepEqual(await freshResponse.json(), savedResponse);
  assert.equal(upstreamCalls, 1);

  const persisted = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  assert.equal(persisted.version, 1);
  assert.equal(persisted.entries.length, 1);
  assert.equal(persisted.entries[0].path, '/competitions/PL/standings?season=2099');
  await close(server);

  delete require.cache[serverModulePath];
  app = require('./server');
  global.fetch = async () => {
    throw new Error('simulated upstream outage');
  };
  server = await listen(app);

  const fallbackResponse = await originalFetch(`http://127.0.0.1:${server.address().port}${route}`);
  assert.equal(fallbackResponse.status, 200);
  assert.equal(fallbackResponse.headers.get('x-data-source'), 'backup');
  assert.equal(fallbackResponse.headers.get('warning'), '110 - "Response is stale"');
  assert.ok(fallbackResponse.headers.get('x-data-saved-at'));
  assert.deepEqual(await fallbackResponse.json(), savedResponse);
});
