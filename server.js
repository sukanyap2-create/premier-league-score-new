require('dotenv').config();

const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');

const app = express();
const API_BASE = 'https://api.football-data.org/v4';
const CACHE_TTL_MS = 90 * 1000;
const UPSTREAM_CALLS_PER_MINUTE = 10;
const UPSTREAM_REQUEST_INTERVAL_MS = 6500;
const MAX_CACHE_ENTRIES = 128;
const PREMIER_LEAGUE_CODE = 'PL';
const BACKUP_FILE = path.resolve(
  process.env.FOOTBALL_DATA_BACKUP_PATH || path.join(__dirname, '.cache', 'football-data-backup.json')
);
const responseCache = new Map();
const distPath = path.join(__dirname, 'dist');
let backupEntries = null;
let backupLoadPromise = null;
let backupWriteQueue = Promise.resolve();
let upstreamRequestQueue = Promise.resolve();
let nextUpstreamRequestAt = 0;

function waitForUpstreamSlot() {
  const scheduledRequest = upstreamRequestQueue.then(async () => {
    const waitMs = Math.max(0, nextUpstreamRequestAt - Date.now());
    if (waitMs > 0) {
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
    nextUpstreamRequestAt = Date.now() + UPSTREAM_REQUEST_INTERVAL_MS;
  });
  upstreamRequestQueue = scheduledRequest.catch(error => {
    console.error('จัดคิวคำขอไปยัง football-data.org ไม่สำเร็จ:', error);
  });
  return scheduledRequest;
}

async function loadBackupEntries() {
  if (backupEntries) return backupEntries;
  if (!backupLoadPromise) {
    backupLoadPromise = (async () => {
      try {
        const content = await fs.readFile(BACKUP_FILE, 'utf8');
        const saved = JSON.parse(content);
        const entries = Array.isArray(saved.entries) ? saved.entries : [];
        backupEntries = new Map(entries.filter(entry => (
          entry &&
          typeof entry.path === 'string' &&
          entry.path.startsWith('/') &&
          Number.isFinite(entry.savedAt) &&
          Object.hasOwn(entry, 'data')
        )).map(entry => [entry.path, { data: entry.data, savedAt: entry.savedAt }]));
        while (backupEntries.size > MAX_CACHE_ENTRIES) {
          backupEntries.delete(backupEntries.keys().next().value);
        }
      } catch (error) {
        backupEntries = new Map();
        if (error.code !== 'ENOENT') {
          console.error(`อ่านข้อมูลสำรอง API จาก ${BACKUP_FILE} ไม่สำเร็จ:`, error);
        }
      }
      return backupEntries;
    })();
  }
  return backupLoadPromise;
}

async function persistBackupEntries() {
  const entries = Array.from(backupEntries, ([entryPath, entry]) => ({
    path: entryPath,
    data: entry.data,
    savedAt: entry.savedAt
  }));
  backupWriteQueue = backupWriteQueue.then(async () => {
    await fs.mkdir(path.dirname(BACKUP_FILE), { recursive: true });
    const temporaryFile = `${BACKUP_FILE}.${process.pid}.tmp`;
    await fs.writeFile(temporaryFile, JSON.stringify({ version: 1, entries }), 'utf8');
    await fs.rename(temporaryFile, BACKUP_FILE);
  }).catch(error => {
    console.error(`บันทึกข้อมูลสำรอง API ไปที่ ${BACKUP_FILE} ไม่สำเร็จ:`, error);
  });
  await backupWriteQueue;
}

async function storeBackup(apiPath, data, savedAt) {
  await loadBackupEntries();
  backupEntries.delete(apiPath);
  backupEntries.set(apiPath, { data, savedAt });
  while (backupEntries.size > MAX_CACHE_ENTRIES) {
    backupEntries.delete(backupEntries.keys().next().value);
  }
  await persistBackupEntries();
}

async function respondWithBackup(apiPath, res, transform, isAllowed) {
  await loadBackupEntries();
  const saved = backupEntries.get(apiPath);
  if (!saved || !isAllowed(saved.data)) return false;
  res.set('X-Data-Source', 'backup');
  res.set('X-Data-Saved-At', new Date(saved.savedAt).toISOString());
  res.set('Warning', '110 - "Response is stale"');
  res.json(transform(saved.data));
  return true;
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateFilters(query, allowed, res) {
  const keys = Object.keys(query);
  if (keys.some(key => !allowed.has(key))) {
    res.status(400).json({ error: 'มีตัวกรองที่ไม่รองรับ' });
    return false;
  }
  if (Object.values(query).some(value => typeof value !== 'string')) {
    res.status(400).json({ error: 'รูปแบบตัวกรองไม่ถูกต้อง' });
    return false;
  }
  if (query.dateFrom && !isValidDate(query.dateFrom)) {
    res.status(400).json({ error: 'วันที่เริ่มต้นต้องอยู่ในรูปแบบ YYYY-MM-DD' });
    return false;
  }
  if (query.dateTo && !isValidDate(query.dateTo)) {
    res.status(400).json({ error: 'วันที่สิ้นสุดต้องอยู่ในรูปแบบ YYYY-MM-DD' });
    return false;
  }
  if (query.date && !isValidDate(query.date)) {
    res.status(400).json({ error: 'date ต้องอยู่ในรูปแบบ YYYY-MM-DD' });
    return false;
  }
  if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo) {
    res.status(400).json({ error: 'วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด' });
    return false;
  }
  if (query.limit && (!/^\d+$/.test(query.limit) || Number(query.limit) < 1 || Number(query.limit) > 100)) {
    res.status(400).json({ error: 'limit ต้องเป็นตัวเลขตั้งแต่ 1 ถึง 100' });
    return false;
  }
  if (query.offset && (!/^\d+$/.test(query.offset) || Number(query.offset) > 100000)) {
    res.status(400).json({ error: 'offset ต้องเป็นตัวเลขตั้งแต่ 0 ถึง 100000' });
    return false;
  }
  if (query.matchday && (!/^\d+$/.test(query.matchday) || Number(query.matchday) < 1 || Number(query.matchday) > 60)) {
    res.status(400).json({ error: 'matchday อยู่นอกช่วงที่รองรับ' });
    return false;
  }
  if (query.status && !/^(SCHEDULED|LIVE|IN_PLAY|PAUSED|FINISHED|POSTPONED|SUSPENDED|CANCELLED|AWARDED)(,(SCHEDULED|LIVE|IN_PLAY|PAUSED|FINISHED|POSTPONED|SUSPENDED|CANCELLED|AWARDED))*$/.test(query.status)) {
    res.status(400).json({ error: 'สถานะการแข่งขันไม่ถูกต้อง' });
    return false;
  }
  if (query.season && !/^\d{4}$/.test(query.season)) {
    res.status(400).json({ error: 'season ต้องเป็นปี ค.ศ. 4 หลัก' });
    return false;
  }
  if (query.areas && !/^\d+(,\d+)*$/.test(query.areas)) {
    res.status(400).json({ error: 'areas ต้องเป็นรหัสพื้นที่ตัวเลข' });
    return false;
  }
  if (query.ids && !/^\d+(,\d+)*$/.test(query.ids)) {
    res.status(400).json({ error: 'ids ต้องเป็นรหัสตัวเลขคั่นด้วยเครื่องหมายจุลภาค' });
    return false;
  }
  if (query.codes && !/^[A-Za-z0-9_-]+(,[A-Za-z0-9_-]+)*$/.test(query.codes)) {
    res.status(400).json({ error: 'codes มีรูปแบบไม่ถูกต้อง' });
    return false;
  }
  return true;
}

function upstreamPathWithQuery(apiPath, query) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (typeof value === 'string') params.set(key, value);
  });
  const suffix = params.toString();
  return `${apiPath}${suffix ? `?${suffix}` : ''}`;
}

async function proxyFootballData(apiPath, res, transform = data => data, isAllowed = () => true) {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    if (await respondWithBackup(apiPath, res, transform, isAllowed)) return;
    res.set('Cache-Control', 'no-store');
    return res.status(503).json({
      error: 'ยังไม่ได้ตั้งค่า FOOTBALL_DATA_TOKEN บนเซิร์ฟเวอร์',
      code: 'TOKEN_NOT_CONFIGURED'
    });
  }

  const cached = responseCache.get(apiPath);
  if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
    if (!isAllowed(cached.data)) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลการแข่งขัน Premier League นี้' });
    }
    res.set('X-Data-Source', 'cache');
    res.set('X-Data-Saved-At', new Date(cached.savedAt).toISOString());
    return res.json(transform(cached.data));
  }

  await waitForUpstreamSlot();
  if (res.destroyed) return;
  const refreshedCache = responseCache.get(apiPath);
  if (refreshedCache && Date.now() - refreshedCache.savedAt < CACHE_TTL_MS) {
    if (!isAllowed(refreshedCache.data)) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลการแข่งขัน Premier League นี้' });
    }
    res.set('X-Data-Source', 'cache');
    res.set('X-Data-Saved-At', new Date(refreshedCache.savedAt).toISOString());
    return res.json(transform(refreshedCache.data));
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const upstream = await fetch(`${API_BASE}${apiPath}`, {
      headers: { 'X-Auth-Token': token },
      signal: controller.signal
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const status = upstream.status;
      if (status === 429) {
        const retryAfter = upstream.headers?.get?.('Retry-After');
        if (retryAfter) res.set('Retry-After', retryAfter);
      }
      const code = status === 401
        ? 'INVALID_TOKEN'
        : status === 403
          ? 'PLAN_UNAVAILABLE'
          : 'UPSTREAM_ERROR';
      if ((status === 429 || status >= 500) && await respondWithBackup(apiPath, res, transform, isAllowed)) {
        return;
      }
      return res.status(status).json({
        error: data.message || `football-data.org ตอบกลับ HTTP ${upstream.status}`,
        code
      });
    }

    if (responseCache.size >= MAX_CACHE_ENTRIES) {
      responseCache.delete(responseCache.keys().next().value);
    }
    const savedAt = Date.now();
    responseCache.set(apiPath, { data, savedAt });
    await storeBackup(apiPath, data, savedAt);
    if (!isAllowed(data)) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลการแข่งขัน Premier League นี้' });
    }
    res.set('X-Data-Source', 'live');
    res.set('X-Data-Saved-At', new Date().toISOString());
    return res.json(transform(data));
  } catch (error) {
    const status = error.name === 'AbortError' ? 504 : 502;
    if (await respondWithBackup(apiPath, res, transform, isAllowed)) return;
    return res.status(status).json({
      error: status === 504 ? 'football-data.org ใช้เวลาตอบกลับนานเกินกำหนด' : 'เชื่อมต่อ football-data.org ไม่สำเร็จ',
      code: status === 504 ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNREACHABLE'
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

const COMPETITION_FILTERS = new Set(['areas', 'codes', 'plan', 'season']);
const MATCH_FILTERS = new Set(['dateFrom', 'dateTo', 'status', 'competitions', 'ids', 'venue', 'limit', 'offset', 'matchday']);
const TEAM_MATCH_FILTERS = new Set(['dateFrom', 'dateTo', 'status', 'competitions', 'venue', 'limit', 'offset']);
const COMPETITION_CODE = /^[A-Za-z0-9_-]{2,12}$/;
const NUMERIC_ID = /^\d{1,12}$/;

app.get('/api/health', (req, res) => res.json({
  ok: true,
  configured: Boolean(process.env.FOOTBALL_DATA_TOKEN),
  source: 'football-data.org API v4',
  freePlan: {
    delayedScores: true,
    delayedSchedules: true,
    leagueTables: true,
    callsPerMinute: UPSTREAM_CALLS_PER_MINUTE
  }
}));

app.get('/api/competitions', (req, res) => {
  if (!validateFilters(req.query, COMPETITION_FILTERS, res)) return;
  if (req.query.codes && req.query.codes.split(',').some(code => code !== PREMIER_LEAGUE_CODE)) {
    return res.status(400).json({ error: 'แอปรองรับเฉพาะ Premier League (PL)' });
  }
  return proxyFootballData(upstreamPathWithQuery('/competitions', {
    ...req.query,
    codes: PREMIER_LEAGUE_CODE
  }), res, data => {
    const competitions = (data.competitions || []).filter(item => item.code === PREMIER_LEAGUE_CODE);
    return { ...data, count: competitions.length, competitions };
  });
});

app.get('/api/areas', (req, res) => {
  if (!validateFilters(req.query, new Set(['ids']), res)) return;
  return proxyFootballData(upstreamPathWithQuery('/areas', req.query), res);
});

app.get('/api/standings', (req, res) => {
  if (!validateFilters(req.query, new Set(['season', 'date']), res)) return;
  return proxyFootballData(upstreamPathWithQuery('/competitions/PL/standings', req.query), res);
});

app.get('/api/matches', (req, res) => {
  if (!validateFilters(req.query, MATCH_FILTERS, res)) return;
  if (req.query.competitions && req.query.competitions.split(',').some(code => code !== PREMIER_LEAGUE_CODE)) {
    return res.status(400).json({ error: 'แอปรองรับเฉพาะการแข่งขัน Premier League (PL)' });
  }
  return proxyFootballData(upstreamPathWithQuery('/matches', {
    ...req.query,
    competitions: PREMIER_LEAGUE_CODE
  }), res);
});

app.get('/api/matches/:matchId/head2head', (req, res) => {
  if (!NUMERIC_ID.test(req.params.matchId)) {
    return res.status(400).json({ error: 'รหัสการแข่งขันไม่ถูกต้อง' });
  }
  if (!validateFilters(req.query, new Set(['limit', 'dateFrom', 'dateTo']), res)) return;
  return proxyFootballData(
    upstreamPathWithQuery(`/matches/${req.params.matchId}/head2head`, req.query),
    res,
    data => {
      const matches = (data.matches || []).filter(match => match.competition?.code === PREMIER_LEAGUE_CODE);
      return { ...data, count: matches.length, matches };
    }
  );
});

app.get('/api/matches/:matchId', (req, res) => {
  if (!NUMERIC_ID.test(req.params.matchId)) {
    return res.status(400).json({ error: 'รหัสการแข่งขันไม่ถูกต้อง' });
  }
  return proxyFootballData(`/matches/${req.params.matchId}`, res, data => data, data => (
    (data.competition || data.match?.competition)?.code === PREMIER_LEAGUE_CODE
  ));
});

app.get('/api/competitions/:code/standings', (req, res) => {
  if (!COMPETITION_CODE.test(req.params.code)) {
    return res.status(400).json({ error: 'รหัสการแข่งขันไม่ถูกต้อง' });
  }
  if (req.params.code !== PREMIER_LEAGUE_CODE) {
    return res.status(404).json({ error: 'แอปรองรับเฉพาะ Premier League (PL)' });
  }
  if (!validateFilters(req.query, new Set(['season', 'date']), res)) return;
  return proxyFootballData(upstreamPathWithQuery(`/competitions/${req.params.code}/standings`, req.query), res);
});

app.get('/api/competitions/:code/teams', (req, res) => {
  if (!COMPETITION_CODE.test(req.params.code)) {
    return res.status(400).json({ error: 'รหัสการแข่งขันไม่ถูกต้อง' });
  }
  if (req.params.code !== PREMIER_LEAGUE_CODE) {
    return res.status(404).json({ error: 'แอปรองรับเฉพาะ Premier League (PL)' });
  }
  if (!validateFilters(req.query, new Set(['season']), res)) return;
  return proxyFootballData(upstreamPathWithQuery(`/competitions/${req.params.code}/teams`, req.query), res);
});

app.get('/api/competitions/:code/matches', (req, res) => {
  if (!COMPETITION_CODE.test(req.params.code)) {
    return res.status(400).json({ error: 'รหัสการแข่งขันไม่ถูกต้อง' });
  }
  if (req.params.code !== PREMIER_LEAGUE_CODE) {
    return res.status(404).json({ error: 'แอปรองรับเฉพาะ Premier League (PL)' });
  }
  if (!validateFilters(req.query, MATCH_FILTERS, res)) return;
  return proxyFootballData(upstreamPathWithQuery(`/competitions/${req.params.code}/matches`, req.query), res);
});

app.get('/api/competitions/:code', (req, res) => {
  if (!COMPETITION_CODE.test(req.params.code)) {
    return res.status(400).json({ error: 'รหัสการแข่งขันไม่ถูกต้อง' });
  }
  if (req.params.code !== PREMIER_LEAGUE_CODE) {
    return res.status(404).json({ error: 'แอปรองรับเฉพาะ Premier League (PL)' });
  }
  if (!validateFilters(req.query, new Set(['season']), res)) return;
  return proxyFootballData(upstreamPathWithQuery(`/competitions/${req.params.code}`, req.query), res);
});

app.get('/api/teams/:teamId/matches', (req, res) => {
  if (!NUMERIC_ID.test(req.params.teamId)) {
    return res.status(400).json({ error: 'รหัสทีมไม่ถูกต้อง' });
  }
  if (!validateFilters(req.query, TEAM_MATCH_FILTERS, res)) return;
  if (req.query.competitions && req.query.competitions.split(',').some(code => code !== PREMIER_LEAGUE_CODE)) {
    return res.status(400).json({ error: 'รองรับเฉพาะการแข่งขัน Premier League (PL)' });
  }
  return proxyFootballData(upstreamPathWithQuery(`/teams/${req.params.teamId}/matches`, {
    ...req.query,
    competitions: PREMIER_LEAGUE_CODE
  }), res);
});

app.get('/api/teams/:teamId', (req, res) => {
  if (!NUMERIC_ID.test(req.params.teamId)) {
    return res.status(400).json({ error: 'รหัสทีมไม่ถูกต้อง' });
  }
  return proxyFootballData(`/teams/${req.params.teamId}`, res);
});

app.use('/api', (req, res) => res.status(404).json({
  error: 'ไม่พบ API endpoint นี้',
  code: 'ENDPOINT_NOT_FOUND'
}));

app.use(express.static(distPath, { dotfiles: 'ignore', index: 'index.html' }));

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`Football dashboard running at http://localhost:${port}`));
}

module.exports = app;
