const test = require('node:test');
const assert = require('node:assert/strict');

test('calculates home and away records from completed matches only', async () => {
  const { calculateHomeAwayStats } = await import('./src/homeAwayStats.mjs');
  const matches = [
    { status: 'FINISHED', homeTeam: { id: 1 }, awayTeam: { id: 2 }, score: { fullTime: { home: 2, away: 0 } } },
    { status: 'FINISHED', homeTeam: { id: 3 }, awayTeam: { id: 1 }, score: { fullTime: { home: 1, away: 1 } } },
    { status: 'AWARDED', homeTeam: { id: 1 }, awayTeam: { id: 4 }, score: { fullTime: { home: 0, away: 1 } } },
    { status: 'SCHEDULED', homeTeam: { id: 1 }, awayTeam: { id: 5 }, score: { fullTime: { home: null, away: null } } },
    { status: 'FINISHED', homeTeam: { id: 6 }, awayTeam: { id: 1 }, score: { fullTime: { home: null, away: null } } }
  ];

  assert.deepEqual(calculateHomeAwayStats(matches, 1), {
    home: { played: 2, wins: 1, draws: 0, losses: 1, goalsFor: 2, goalsAgainst: 1, points: 3 },
    away: { played: 1, wins: 0, draws: 1, losses: 0, goalsFor: 1, goalsAgainst: 1, points: 1 },
    completedMatches: 3
  });
});
