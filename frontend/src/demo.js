function getTeams() {
  const table = window.PL_BACKUP?.teams || [];
  return table.map(row => ({
    id: row[1],
    name: row[2],
    crest: row[3],
    position: row[0],
    playedGames: row[4],
    won: row[5],
    draw: row[6],
    lost: row[7],
    goalsFor: row[8],
    goalsAgainst: row[9],
    goalDifference: row[10],
    points: row[11],
    form: row[12]
  }));
}

function getMatches() {
  const teams = getTeams();
  const idByName = new Map(teams.map(team => [team.name, team.id]));
  const matches = [];
  const fixtureBackup = window.PL_MATCHES_BACKUP;

  Object.entries(fixtureBackup?.weeks || {}).forEach(([week, rows]) => {
    rows.forEach(([utcDate, homeIndex, awayIndex, homeGoals, awayGoals], index) => {
      const homeName = fixtureBackup.teams[homeIndex];
      const awayName = fixtureBackup.teams[awayIndex];
      matches.push({
        id: `demo-${week}-${index + 1}`,
        matchday: Number(week),
        utcDate,
        status: homeGoals == null || awayGoals == null ? 'SCHEDULED' : 'FINISHED',
        homeTeam: { id: idByName.get(homeName), name: homeName },
        awayTeam: { id: idByName.get(awayName), name: awayName },
        score: { fullTime: { home: homeGoals, away: awayGoals } }
      });
    });
  });

  Object.entries(window.PL_BACKUP?.matches || {}).forEach(([week, rows]) => {
    rows.forEach((row, index) => {
      matches.push({
        id: `demo-${week}-${index + 1}`,
        matchday: Number(week),
        utcDate: row[0],
        status: row[1] === 'TIMED' ? 'SCHEDULED' : row[1],
        homeTeam: { id: idByName.get(row[2]), name: row[2] },
        awayTeam: { id: idByName.get(row[3]), name: row[3] },
        score: { fullTime: { home: row[4], away: row[5] } }
      });
    });
  });

  const seen = new Set();
  return matches
    .sort((left, right) => new Date(left.utcDate) - new Date(right.utcDate))
    .filter(match => {
      const key = `${match.utcDate}|${match.homeTeam.name}|${match.awayTeam.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function applyFilters(matches, params) {
  return matches.filter(match => {
    const date = match.utcDate?.slice(0, 10) || '';
    if (params.get('matchday') && Number(match.matchday) !== Number(params.get('matchday'))) return false;
    if (params.get('status') && match.status !== params.get('status')) return false;
    if (params.get('dateFrom') && date < params.get('dateFrom')) return false;
    if (params.get('dateTo') && date > params.get('dateTo')) return false;
    const search = params.get('q')?.toLocaleLowerCase();
    if (search && !`${match.homeTeam.name} ${match.awayTeam.name}`.toLocaleLowerCase().includes(search)) return false;
    return true;
  });
}

function paginate(items, params) {
  const limit = Math.min(100, Math.max(1, Number(params.get('limit')) || 20));
  const offset = Math.max(0, Number(params.get('offset')) || 0);
  return {
    count: items.length,
    limit,
    offset,
    items: items.slice(offset, offset + limit)
  };
}

export function getDemoResponse(path) {
  const url = new URL(path, window.location.origin);
  const { pathname, searchParams } = url;
  const teams = getTeams();
  const matches = getMatches();
  const table = teams.map(({ position, ...team }) => ({ position, team, ...team }));
  const competition = {
    id: 2021,
    name: 'Premier League',
    code: 'PL',
    type: 'LEAGUE',
    emblem: 'https://crests.football-data.org/PL.png',
    currentSeason: {
      currentMatchday: window.PL_BACKUP?.currentMatchday || 1
    }
  };

  if (pathname === '/api/competitions') {
    return { count: 1, competitions: [competition] };
  }
  if (pathname === '/api/areas') {
    return { count: 0, areas: [] };
  }
  if (pathname === '/api/matches') {
    const filtered = applyFilters(matches, searchParams);
    const page = paginate(filtered, searchParams);
    return { count: filtered.length, resultSet: page, matches: page.items };
  }
  if (pathname === '/api/standings' || pathname === '/api/competitions/PL/standings') {
    return {
      competition,
      season: { currentMatchday: window.PL_BACKUP?.currentMatchday || 1 },
      standings: [{
        type: 'TOTAL',
        table: table.map(({ position, team, playedGames, won, draw, lost, points, goalsFor, goalsAgainst, goalDifference, form }) => ({
          position, team, playedGames, won, draw, lost, points, goalsFor, goalsAgainst, goalDifference, form
        }))
      }]
    };
  }
  if (pathname === '/api/competitions/PL') {
    return {
      ...competition,
      area: { name: 'England' },
      numberOfAvailableSeasons: 1
    };
  }
  if (pathname === '/api/competitions/PL/teams') {
    return {
      competition,
      count: teams.length,
      season: { currentMatchday: window.PL_BACKUP?.currentMatchday || 1 },
      teams
    };
  }
  if (pathname === '/api/competitions/PL/matches') {
    const filtered = applyFilters(matches, searchParams);
    const page = paginate(filtered, searchParams);
    return { competition, count: filtered.length, resultSet: page, matches: page.items };
  }

  const teamMatch = pathname.match(/^\/api\/teams\/(\d+)(\/matches)?$/);
  if (teamMatch) {
    const teamId = Number(teamMatch[1]);
    const team = teams.find(entry => Number(entry.id) === teamId);
    if (!team) return { __unavailable: 'ไม่มีทีมตัวอย่างนี้ในโหมด Demo' };
    if (teamMatch[2]) {
      const teamMatches = matches.filter(match =>
        Number(match.homeTeam.id) === teamId || Number(match.awayTeam.id) === teamId
      );
      const filtered = applyFilters(teamMatches, searchParams);
      const page = paginate(filtered, searchParams);
      return { team, count: filtered.length, resultSet: page, matches: page.items };
    }
    return { ...team, runningCompetitions: [competition], squad: [] };
  }

  const matchRoute = pathname.match(/^\/api\/matches\/(\d+|demo-\d+-\d+)(\/head2head)?$/);
  if (matchRoute) {
    const match = matches.find(entry => String(entry.id) === matchRoute[1]);
    if (!match) return { __unavailable: 'การแข่งขันนี้ไม่มีในข้อมูลตัวอย่าง' };
    if (matchRoute[2]) {
      const pair = matches.filter(entry =>
        (entry.homeTeam.id === match.homeTeam.id && entry.awayTeam.id === match.awayTeam.id) ||
        (entry.homeTeam.id === match.awayTeam.id && entry.awayTeam.id === match.homeTeam.id)
      );
      return {
        aggregates: { numberOfMatches: pair.length },
        matches: pair
      };
    }
    return { ...match, competition };
  }

  if (/^\/api\/competitions\/[^/]+$/.test(pathname)) {
    return { __unavailable: 'การแข่งขันนี้ไม่มีในข้อมูลตัวอย่าง' };
  }
  if (/^\/api\/competitions\/[^/]+\/(standings|teams|matches)$/.test(pathname)) {
    return { __unavailable: 'โหมดตัวอย่างมีข้อมูลเฉพาะ Premier League' };
  }
  return { __unavailable: 'ข้อมูลนี้ไม่มีในโหมดตัวอย่าง' };
}
