function createRecord() {
  return {
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0
  };
}

export function calculateHomeAwayStats(matches, teamId) {
  const stats = {
    home: createRecord(),
    away: createRecord(),
    completedMatches: 0
  };

  for (const match of matches || []) {
    if (!['FINISHED', 'AWARDED'].includes(match.status)) continue;

    const homeId = match.homeTeam?.id;
    const awayId = match.awayTeam?.id;
    const isHome = String(homeId) === String(teamId);
    const isAway = String(awayId) === String(teamId);
    if (!isHome && !isAway) continue;

    const homeGoals = match.score?.fullTime?.home;
    const awayGoals = match.score?.fullTime?.away;
    if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) continue;

    const record = isHome ? stats.home : stats.away;
    const goalsFor = isHome ? homeGoals : awayGoals;
    const goalsAgainst = isHome ? awayGoals : homeGoals;
    record.played += 1;
    record.goalsFor += goalsFor;
    record.goalsAgainst += goalsAgainst;
    stats.completedMatches += 1;

    if (goalsFor > goalsAgainst) {
      record.wins += 1;
      record.points += 3;
    } else if (goalsFor === goalsAgainst) {
      record.draws += 1;
      record.points += 1;
    } else {
      record.losses += 1;
    }
  }

  return stats;
}
