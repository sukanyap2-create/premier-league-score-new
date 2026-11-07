const test = require('node:test');
const assert = require('node:assert/strict');
const { formatSquadUpdatedAt, groupSquadByPosition, isSquadDataStale } = require('./frontend/src/squad');
const { CLUB_OWNERSHIP } = require('./frontend/src/clubOwnership');

test('groups players by API positions and omits players without a recognized position', () => {
  const grouped = groupSquadByPosition([
    { id: 1, name: 'Goalkeeper', position: 'Goalkeeper' },
    { id: 2, name: 'Defender', position: 'Defence' },
    { id: 3, name: 'Midfielder', position: 'Midfield' },
    { id: 4, name: 'Forward', position: 'Offence' },
    { id: 5, name: 'Unknown', position: null }
  ]);

  assert.deepEqual(grouped.map(group => [group.label, group.players.length]), [
    ['ผู้รักษาประตู', 1],
    ['กองหลัง', 1],
    ['กองกลาง', 1],
    ['กองหน้า', 1]
  ]);
  assert.equal(grouped.reduce((count, group) => count + group.players.length, 0), 4);
});

test('marks missing or older-than-90-day squad timestamps as stale', () => {
  const now = Date.parse('2026-11-06T00:00:00Z');
  assert.equal(isSquadDataStale('2026-10-01T00:00:00Z', now), false);
  assert.equal(isSquadDataStale('2022-04-03T16:22:14Z', now), true);
  assert.equal(isSquadDataStale(null, now), true);
  assert.match(formatSquadUpdatedAt('2022-04-03T16:22:14Z'), /2565/);
  assert.equal(formatSquadUpdatedAt(null), 'ไม่ระบุวันที่อัปเดต');
});

test('club ownership records include a named owner and a source link', () => {
  const records = Object.values(CLUB_OWNERSHIP);
  assert.ok(records.length >= 20);
  for (const record of records) {
    assert.ok(record.owner);
    assert.match(record.source, /^https:\/\/\S+$/);
    assert.ok(record.sourceDate);
  }
});
