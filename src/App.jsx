import React, { useEffect, useMemo, useState } from 'react';
import { getApiHealth, getDashboardData, getStaleDashboardData } from './api.js';
import { CLUB_OWNERSHIP } from './clubOwnership.js';
import { buildSubstringIndex, searchSubstringIndex } from './dsa.mjs';
import { calculateHomeAwayStats } from './homeAwayStats.mjs';
import { formatSquadUpdatedAt, groupSquadByPosition, isSquadDataStale } from './squad.js';
import {
  Card,
  Crest,
  MatchTable,
  MetricCard,
  MobileNav,
  PAGE_META,
  Pagination,
  PageHeading,
  PointsChart,
  Sidebar,
  StandingsTable,
  StatusNotice,
  TeamGrid
} from './components.jsx';

const PAGE_SIZE = 20;

function makeQuery(values) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== '' && value != null) query.set(key, String(value));
  });
  const suffix = query.toString();
  return suffix ? `?${suffix}` : '';
}

function useResource(path, mode, refreshKey = 0) {
  const [resource, setResource] = useState({
    data: null,
    source: null,
    savedAt: null,
    status: { kind: 'loading', message: 'กำลังโหลดข้อมูล...' }
  });

  useEffect(() => {
    if (!path) {
      setResource({ data: null, source: null, savedAt: null, status: null });
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setResource(previous => ({
      ...previous,
      status: { kind: 'loading', message: 'กำลังโหลดข้อมูล...' }
    }));

    getDashboardData(path, { mode, signal: controller.signal }).then(result => {
      if (!active) return;
      if (result.data?.__unavailable) {
        setResource({
          data: null,
          source: result.source,
          savedAt: null,
          status: { kind: 'unavailable', message: result.data.__unavailable }
        });
        return;
      }
      setResource({ ...result, status: { kind: 'success', message: '' } });
    }).catch(error => {
      if (!active || error.name === 'AbortError') return;
      console.error(`โหลดข้อมูล ${path} ไม่สำเร็จ:`, error);
      if (error.unavailable) {
        setResource({
          data: null,
          source: null,
          savedAt: null,
          status: { kind: 'unavailable', message: 'ไม่พบข้อมูลนี้ หรือแพ็กเกจ/สิทธิ์ API ปัจจุบันไม่รองรับ' }
        });
        return;
      }
      const cached = getStaleDashboardData(path);
      if (cached) {
        setResource({
          data: cached.data,
          source: 'stale',
          savedAt: cached.savedAt,
          status: {
            kind: 'warning',
            message: `เชื่อมต่อ API ไม่สำเร็จ กำลังแสดงข้อมูลที่บันทึกไว้เมื่อ ${new Date(cached.savedAt).toLocaleString('th-TH')}`
          }
        });
        return;
      }
      if (error.rateLimited) {
        const retryAfterSeconds = Number(error.retryAfter);
        const waitMessage = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? ` ลองใหม่หลังจากประมาณ ${retryAfterSeconds} วินาที`
          : ' กรุณารอสักครู่แล้วกดอัปเดตข้อมูลอีกครั้ง';
        setResource({
          data: null,
          source: null,
          savedAt: null,
          status: { kind: 'warning', message: `คำขอถึงโควตาของ Football-Data.org Free Plan แล้ว.${waitMessage}` }
        });
        return;
      }
      setResource({
        data: null,
        source: null,
        savedAt: null,
        status: { kind: 'error', message: error.message || 'เกิดข้อผิดพลาดขณะโหลดข้อมูล' }
      });
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [path, mode, refreshKey]);

  return resource;
}

function ClubComparison({ rows }) {
  const statistics = [
    { label: 'อันดับ', key: 'position', lowerIsBetter: true },
    { label: 'แข่ง', key: 'playedGames' },
    { label: 'ชนะ', key: 'won' },
    { label: 'เสมอ', key: 'draw' },
    { label: 'แพ้', key: 'lost', lowerIsBetter: true },
    { label: 'ประตูได้', key: 'goalsFor' },
    { label: 'ประตูเสีย', key: 'goalsAgainst', lowerIsBetter: true },
    { label: 'ผลต่างประตู', key: 'goalDifference' },
    { label: 'คะแนน', key: 'points' }
  ];
  const hasForm = rows.some(row => typeof row.form === 'string' && row.form.length > 0);

  return (
    <div className="compare-table-wrap">
      <table className="compare-table">
        <thead><tr><th>สถิติ</th>{rows.map(row => (
          <th key={row.team.id}><span className="compare-team-heading"><Crest item={row.team} />{row.team.name}</span></th>
        ))}</tr></thead>
        <tbody>
          {statistics.map(({ label, key, lowerIsBetter = false }) => {
            const values = rows.map(row => row[key]);
            const validValues = values.filter(value => typeof value === 'number');
            const bestValue = validValues.length
              ? (lowerIsBetter ? Math.min(...validValues) : Math.max(...validValues))
              : null;
            return <tr key={key}>
              <th scope="row">{label}</th>
              {values.map((value, index) => <td className={value === bestValue && validValues.length > 1 ? 'compare-better' : ''} key={rows[index].team.id}>{value ?? '—'}</td>)}
            </tr>;
          })}
          {hasForm && <tr>
            <th scope="row">ฟอร์ม 5 นัด</th>
            {rows.map(row => <td key={row.team.id}>{(typeof row.form === 'string' ? row.form.split(',').filter(Boolean).slice(-5).join(' ') : '') || '—'}</td>)}
          </tr>}
        </tbody>
      </table>
    </div>
  );
}

function TeamSquad({ team }) {
  const squad = Array.isArray(team?.squad) ? team.squad : [];
  const groups = groupSquadByPosition(squad);
  const updatedAt = formatSquadUpdatedAt(team?.lastUpdated);
  const stale = isSquadDataStale(team?.lastUpdated);

  return (
    <Card title="รายชื่อผู้เล่น" subtitle={`${squad.length} คน • ข้อมูลตามที่ API ส่งกลับ`}>
      {!squad.length
        ? <div className="empty-inline">API ไม่มีรายชื่อผู้เล่นของสโมสรนี้ในข้อมูลที่เข้าถึงได้</div>
        : <>
          <div className="squad-updated">อัปเดตข้อมูลล่าสุด: <strong>{updatedAt}</strong></div>
          {stale && <StatusNotice status={{
            kind: 'warning',
            message: 'ข้อมูลรายชื่อผู้เล่นเก่ากว่า 90 วันหรือ API ไม่ระบุวันที่อัปเดต โปรดตรวจสอบกับสโมสรอีกครั้งก่อนใช้อ้างอิงว่าเป็นรายชื่อล่าสุด'
          }} />}
          <div className="squad-groups">
            {groups.map(group => (
              <section className="squad-group" key={group.key}>
                <h3>{group.label}<span>{group.players.length}</span></h3>
                <ul>
                  {group.players.map((player, index) => (
                    <li key={player.id || `${player.name}-${index}`}>
                      <strong>{player.name || 'ไม่ระบุชื่อ'}</strong>
                      <span>{player.nationality || 'ไม่ระบุสัญชาติ'}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>}
    </Card>
  );
}

function DashboardApp() {
  const [page, setPage] = useState('home');
  const [mode, setMode] = useState('demo');
  const [configured, setConfigured] = useState(false);
  const [healthStatus, setHealthStatus] = useState({ kind: 'loading', message: 'กำลังตรวจสอบการเชื่อมต่อ API...' });
  const competitionCode = 'PL';
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [favoriteTeamIds, setFavoriteTeamIds] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('premier-league-favorite-teams') || '[]');
      return Array.isArray(saved) ? saved.filter(id => typeof id === 'string') : [];
    } catch (error) {
      console.warn('อ่านสโมสรโปรดไม่สำเร็จ:', error);
      return [];
    }
  });
  const [compareTeamIds, setCompareTeamIds] = useState(['', '']);
  const [searchText, setSearchText] = useState('');
  const [teamQuery, setTeamQuery] = useState('');
  const [matchFilters, setMatchFilters] = useState({ status: '', dateFrom: '', dateTo: '', matchday: '' });
  const [pageNumber, setPageNumber] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    getApiHealth(controller.signal).then(result => {
      if (!active) return;
      setConfigured(Boolean(result.configured));
      setHealthStatus({
        kind: result.configured ? 'success' : 'warning',
        message: result.configured
          ? 'เชื่อมต่อเซิร์ฟเวอร์ API แล้ว'
          : 'ยังไม่มี API token — กำลังใช้ข้อมูลตัวอย่างที่มีป้ายกำกับ Demo'
      });
      let savedMode = null;
      try {
        savedMode = localStorage.getItem('football-dashboard-mode');
      } catch (error) {
        console.warn('อ่านการตั้งค่าโหมดไม่สำเร็จ:', error);
      }
      setMode(savedMode === 'demo' || savedMode === 'live'
        ? savedMode
        : result.configured ? 'live' : 'demo');
    }).catch(error => {
      if (!active || error.name === 'AbortError') return;
      console.error('ตรวจสอบสถานะ API ไม่สำเร็จ:', error);
      setHealthStatus({ kind: 'error', message: 'ตรวจสอบเซิร์ฟเวอร์ API ไม่สำเร็จ — เลือกโหมดตัวอย่างเพื่อทดลองหน้าเว็บ' });
      setMode('demo');
    });
    try {
      const savedTheme = localStorage.getItem('football-dashboard-theme');
      if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme);
    } catch (error) {
      console.warn('อ่านธีมไม่สำเร็จ:', error);
    }
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('football-dashboard-theme', theme);
    } catch (error) {
      console.warn('บันทึกธีมไม่สำเร็จ:', error);
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem('premier-league-favorite-teams', JSON.stringify(favoriteTeamIds));
    } catch (error) {
      console.warn('บันทึกสโมสรโปรดไม่สำเร็จ:', error);
    }
  }, [favoriteTeamIds]);

  useEffect(() => {
    const handleSearchShortcut = event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault();
        setPage('search');
        window.setTimeout(() => document.querySelector('.search-box input')?.focus(), 50);
      }
    };
    window.addEventListener('keydown', handleSearchShortcut);
    return () => window.removeEventListener('keydown', handleSearchShortcut);
  }, []);

  useEffect(() => setPageNumber(1), [page, competitionCode, teamQuery, matchFilters.status, matchFilters.dateFrom, matchFilters.dateTo, matchFilters.matchday]);

  const competitionLabel = 'Premier League';
  const matchQuery = makeQuery({
    ...matchFilters,
    limit: PAGE_SIZE,
    offset: (pageNumber - 1) * PAGE_SIZE
  });
  const today = new Date();
  const upcomingMatchesQuery = makeQuery({
    dateFrom: today.toISOString().slice(0, 10),
    dateTo: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    limit: 5
  });

  const standingsPath = ['home', 'standings'].includes(page) && competitionCode
    ? `/api/competitions/${encodeURIComponent(competitionCode)}/standings`
    : null;
  const standingsResource = useResource(standingsPath, mode, refreshKey);

  const matchesPath = page === 'home'
    ? `/api/competitions/${encodeURIComponent(competitionCode)}/matches${upcomingMatchesQuery}`
    : page === 'matches'
      ? `/api/competitions/${encodeURIComponent(competitionCode)}/matches${matchQuery}`
      : null;
  const matchesResource = useResource(matchesPath, mode, refreshKey);

  const teamsPath = ['teams', 'search'].includes(page) && competitionCode
    ? `/api/competitions/${encodeURIComponent(competitionCode)}/teams`
    : null;
  const teamsResource = useResource(teamsPath, mode, refreshKey);
  const teams = teamsResource.data?.teams || [];

  const teamId = page === 'team' ? selectedTeam?.id : null;
  const teamPath = teamId ? `/api/teams/${encodeURIComponent(teamId)}` : null;
  const teamResource = useResource(teamPath, mode, refreshKey);
  const teamMatchesPath = teamId
    ? `/api/teams/${encodeURIComponent(teamId)}/matches${makeQuery({ limit: 100, offset: 0 })}`
    : null;
  const teamMatchesResource = useResource(teamMatchesPath, mode, refreshKey);

  const matchId = page === 'match' ? selectedMatch?.id : null;
  const matchPath = matchId ? `/api/matches/${encodeURIComponent(matchId)}` : null;
  const matchResource = useResource(matchPath, mode, refreshKey);
  const headToHeadPath = matchId ? `/api/matches/${encodeURIComponent(matchId)}/head2head?limit=10` : null;
  const headToHeadResource = useResource(headToHeadPath, mode, refreshKey);

  const searchMatchesResource = useResource(
    page === 'search' && competitionCode && searchText.trim()
      ? `/api/competitions/${encodeURIComponent(competitionCode)}/matches${makeQuery({ limit: 100 })}`
      : null,
    mode,
    refreshKey
  );

  const standingsGroups = standingsResource.data?.standings || [];
  const totalStandings = standingsGroups.find(group => group.type === 'TOTAL') || standingsGroups[0];
  const standingRows = totalStandings?.table || [];
  const favoriteRows = standingRows.filter(row => favoriteTeamIds.includes(String(row.team?.id)));
  const comparedRows = compareTeamIds.map(id => standingRows.find(row => String(row.team?.id) === id) || null);
  const allMatches = matchesResource.data?.matches || [];
  const rawTeams = teams;
  const teamSearchIndex = useMemo(() => buildSubstringIndex(rawTeams, team => (
    `${team.name || ''} ${team.shortName || ''} ${team.tla || ''} ${team.area?.name || ''}`
  )), [rawTeams]);
  const filteredTeams = useMemo(
    () => teamQuery.trim() ? searchSubstringIndex(teamSearchIndex, teamQuery) : rawTeams,
    [rawTeams, teamSearchIndex, teamQuery]
  );
  const filteredSearchTeams = useMemo(
    () => searchText.trim() ? searchSubstringIndex(teamSearchIndex, searchText) : rawTeams,
    [rawTeams, teamSearchIndex, searchText]
  );
  const filteredSearchMatches = useMemo(() => (searchMatchesResource.data?.matches || []).filter(match =>
    `${match.homeTeam?.name || ''} ${match.awayTeam?.name || ''} ${match.competition?.name || ''}`.toLocaleLowerCase().includes(searchText.trim().toLocaleLowerCase())
  ), [searchMatchesResource.data, searchText]);

  function changeMode(nextMode) {
    setMode(nextMode);
    try {
      localStorage.setItem('football-dashboard-mode', nextMode);
    } catch (error) {
      console.warn('บันทึกโหมดข้อมูลไม่สำเร็จ:', error);
    }
  }

  function openTeam(team) {
    setSelectedTeam(team);
    setPage('team');
  }

  function toggleFavorite(team) {
    if (team?.id == null) return;
    const teamId = String(team.id);
    setFavoriteTeamIds(current => current.includes(teamId)
      ? current.filter(id => id !== teamId)
      : [...current, teamId]);
  }

  function openMatch(match) {
    setSelectedMatch(match);
    setPage('match');
  }

  function renderResourceStatus(resource) {
    if (resource.status?.kind === 'success' && resource.source) {
      const backupTimestamp = resource.savedAt
        ? new Date(resource.savedAt).toLocaleString('th-TH')
        : 'ไม่ทราบเวลา';
      const sourceMessages = {
        live: 'ข้อมูลจาก football-data.org API',
        cache: 'ข้อมูลจาก cache ของ Express',
        stale: resource.status.message,
        backup: `API ไม่พร้อมใช้งาน — กำลังแสดงข้อมูลสำรองล่าสุดจาก ${backupTimestamp}`,
        demo: 'ข้อมูลตัวอย่างจากโปรเจกต์ (Demo)'
      };
      return <StatusNotice status={{
        kind: ['stale', 'backup', 'demo'].includes(resource.source) ? 'warning' : 'success',
        message: sourceMessages[resource.source]
      }} />;
    }
    return <StatusNotice status={resource.status} />;
  }

  function renderMatchFilters() {
    return (
      <div className="filter-row">
        <label className="control-field"><span>สถานะ</span>
          <select value={matchFilters.status} onChange={event => setMatchFilters(current => ({ ...current, status: event.target.value }))}>
            <option value="">ทุกสถานะ</option><option value="SCHEDULED">รอแข่งขัน</option><option value="IN_PLAY">กำลังแข่งขัน</option>
            <option value="FINISHED">จบการแข่งขัน</option><option value="POSTPONED">เลื่อนแข่ง</option>
          </select>
        </label>
        <label className="control-field"><span>ตั้งแต่วันที่</span>
          <input type="date" value={matchFilters.dateFrom} onChange={event => setMatchFilters(current => ({ ...current, dateFrom: event.target.value }))} />
        </label>
        <label className="control-field"><span>ถึงวันที่</span>
          <input type="date" value={matchFilters.dateTo} onChange={event => setMatchFilters(current => ({ ...current, dateTo: event.target.value }))} />
        </label>
        <label className="control-field"><span>นัดที่</span>
          <select value={matchFilters.matchday} onChange={event => setMatchFilters(current => ({ ...current, matchday: event.target.value }))}>
            <option value="">ทุกนัด</option>{Array.from({ length: 38 }, (_, index) => <option value={index + 1} key={index + 1}>นัดที่ {index + 1}</option>)}
          </select>
        </label>
      </div>
    );
  }

  function renderHome() {
    const matchesCount = allMatches.length;
    const latestUpdate = [matchesResource.savedAt, standingsResource.savedAt]
      .filter(Boolean)
      .map(value => new Date(value))
      .filter(value => !Number.isNaN(value.getTime()))
      .sort((left, right) => right.getTime() - left.getTime())[0];
    const isRefreshing = matchesResource.status?.kind === 'loading' || standingsResource.status?.kind === 'loading';
    const homeStatusResource = [matchesResource, standingsResource].find(resource => (
      ['error', 'warning', 'unavailable'].includes(resource.status?.kind) ||
      ['backup', 'stale'].includes(resource.source)
    )) || [standingsResource, matchesResource].find(resource => resource.source) || matchesResource;
    return (
      <>
        <PageHeading
          eyebrow="ENGLISH PREMIER LEAGUE"
          title="พรีเมียร์ลีก"
          description="ติดตามโปรแกรม ผลการแข่งขัน ตารางคะแนน และสโมสรในพรีเมียร์ลีก"
          actions={<div className="dashboard-refresh">
            <span>{latestUpdate ? `อัปเดต ${latestUpdate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}` : 'รอข้อมูลจาก API'}</span>
            <button type="button" className="secondary-button" onClick={() => setRefreshKey(value => value + 1)} disabled={isRefreshing || mode === 'demo'}>
              {isRefreshing ? 'กำลังโหลด…' : '↻ อัปเดตข้อมูล'}
            </button>
          </div>}
        />
        {mode === 'demo' && <StatusNotice status={{ kind: 'warning', message: 'DEMO MODE — ข้อมูลด้านล่างเป็นข้อมูลตัวอย่างจากไฟล์ในโปรเจกต์ ไม่ใช่ข้อมูลสดและอาจไม่ตรงกับสถานการณ์จริง' }} />}
        {mode !== 'demo' && renderResourceStatus(homeStatusResource)}
        <div className="metric-grid overview-metrics">
          <MetricCard label="นัดปัจจุบัน" value={standingsResource.data?.season?.currentMatchday ?? '—'} note="Matchday" icon="◈" />
          <MetricCard label="โปรแกรม 7 วันข้างหน้า" value={matchesResource.data ? matchesCount : '—'} note="คู่ที่ API ส่งกลับ" icon="◷" tone="green" />
          <MetricCard label="คะแนนนำสูงสุด" value={standingRows[0]?.points ?? '—'} note={standingRows[0]?.team?.name || 'ไม่มีข้อมูลตาราง'} icon="↗" tone="orange" />
        </div>
        <div className="content-grid">
          <Card title="โปรแกรม 7 วันข้างหน้า" subtitle={competitionLabel} action={
            <button type="button" className="card-link" onClick={() => setPage('matches')}>ดูโปรแกรมทั้งหมด <span aria-hidden="true">→</span></button>
          }>
            {matchesResource.data && <MatchTable matches={allMatches.slice(0, 5)} onSelect={openMatch} compact />}
            {!matchesResource.data && renderResourceStatus(matchesResource)}
          </Card>
          <Card title="5 อันดับแรก" subtitle="คะแนนจากตารางพรีเมียร์ลีก" action={
            <button type="button" className="card-link" onClick={() => setPage('standings')}>ดูตารางเต็ม <span aria-hidden="true">→</span></button>
          }>
            {standingRows.length > 0 && <PointsChart rows={standingRows} limit={5} />}
            {!standingRows.length && renderResourceStatus(standingsResource)}
          </Card>
        </div>
        <Card title="สโมสรโปรด" subtitle="บันทึกไว้ในเบราว์เซอร์ของคุณ">
          {favoriteRows.length
            ? <div className="favorite-list">{favoriteRows.map(row => (
              <button type="button" className="favorite-team" key={row.team.id} onClick={() => openTeam(row.team)}>
                <span className="favorite-team-name"><Crest item={row.team} />{row.team.name}</span>
                <span>อันดับ {row.position ?? '—'}</span>
                <strong>{row.points ?? '—'} แต้ม</strong>
                <span className="favorite-star" aria-hidden="true">★</span>
              </button>
            ))}</div>
            : <div className="empty-inline">ยังไม่มีสโมสรโปรด เลือกดาวในตารางคะแนนเพื่อเพิ่มสโมสร</div>}
        </Card>
      </>
    );
  }

  function renderMatches() {
    const total = matchesResource.data?.count ?? matchesResource.data?.resultSet?.count ?? allMatches.length;
    return (
      <>
        <PageHeading eyebrow="PREMIER LEAGUE FIXTURES" title="โปรแกรมและผลการแข่งขัน" description="กรองโปรแกรมและผลพรีเมียร์ลีกตามช่วงวันและสถานะ" />
        {mode === 'demo' && <StatusNotice status={{ kind: 'warning', message: 'ข้อมูลตัวอย่าง (Demo) — คะแนนและวันแข่งขันไม่ใช่ข้อมูลสด' }} />}
        {renderMatchFilters()}
        {renderResourceStatus(matchesResource)}
        {matchesResource.data && <Card><MatchTable matches={allMatches} onSelect={openMatch} /></Card>}
        <Pagination page={pageNumber} pageSize={PAGE_SIZE} total={total} onChange={setPageNumber} />
      </>
    );
  }

  function renderStandings() {
    return (
      <>
        <PageHeading eyebrow="PREMIER LEAGUE TABLE" title="ตารางคะแนนพรีเมียร์ลีก" description="อันดับและสถิติพรีเมียร์ลีกที่ส่งกลับจาก API" />
        {mode === 'demo' && <StatusNotice status={{ kind: 'warning', message: 'DEMO SAMPLE — ตารางคะแนนนี้เป็นข้อมูลตัวอย่าง ไม่ใช่ตารางสด' }} />}
        {renderResourceStatus(standingsResource)}
        {standingsResource.data && <Card title={competitionLabel} subtitle={standingsResource.data.season?.currentMatchday ? `Matchday ${standingsResource.data.season.currentMatchday}` : 'อันดับอย่างเป็นทางการจาก API'}>
          <StandingsTable
            standings={totalStandings}
            onSelectTeam={openTeam}
            favoriteTeamIds={favoriteTeamIds}
            onToggleFavorite={toggleFavorite}
          />
        </Card>}
        {standingRows.length > 1 && <Card title="เปรียบเทียบสโมสร" subtitle="เทียบสถิติจากตารางคะแนนปัจจุบัน">
          <div className="compare-selectors">
            {[0, 1].map(index => (
              <label className="control-field" key={index}>
                <span>{index === 0 ? 'สโมสรที่ 1' : 'สโมสรที่ 2'}</span>
                <select
                  aria-label={`เลือกสโมสรที่ ${index + 1} เพื่อเปรียบเทียบ`}
                  value={compareTeamIds[index]}
                  onChange={event => setCompareTeamIds(current => current.map((id, itemIndex) => itemIndex === index ? event.target.value : id))}
                >
                  <option value="">เลือกสโมสร</option>
                  {standingRows.map(row => <option value={String(row.team?.id)} key={row.team?.id}>{row.team?.name || 'ไม่ทราบชื่อทีม'}</option>)}
                </select>
              </label>
            ))}
          </div>
          {comparedRows[0] && comparedRows[1] && comparedRows[0] === comparedRows[1]
            ? <div className="empty-inline">เลือกคนละสโมสรเพื่อเปรียบเทียบ</div>
            : comparedRows.every(Boolean) && <ClubComparison rows={comparedRows} />}
        </Card>}
      </>
    );
  }

  function renderTeams() {
    return (
      <>
        <PageHeading eyebrow="PREMIER LEAGUE CLUBS" title="สโมสรพรีเมียร์ลีก" description="ค้นหาสโมสรที่แข่งขันใน Premier League" />
        <label className="search-box"><span aria-hidden="true">⌕</span><input type="search" value={teamQuery} onChange={event => setTeamQuery(event.target.value)} placeholder="ค้นหาชื่อทีม..." /></label>
        <p className="dsa-feedback" role="status">ค้นหาทีมผ่านดัชนี substring ใน React — สร้างดัชนีเมื่อโหลดรายชื่อทีมและค้นหาได้ทันทีโดยไม่เรียก API เพิ่ม</p>
        {mode === 'demo' && <StatusNotice status={{ kind: 'warning', message: 'รายชื่อทีมเป็นข้อมูลตัวอย่างจากไฟล์ในโปรเจกต์' }} />}
        {renderResourceStatus(teamsResource)}
        {teamsResource.data && <TeamGrid teams={filteredTeams.slice((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE)} onSelect={openTeam} />}
        <Pagination page={pageNumber} pageSize={PAGE_SIZE} total={filteredTeams.length} onChange={setPageNumber} />
      </>
    );
  }

  function renderTeamDetail() {
    const team = teamResource.data || selectedTeam;
    const ownership = CLUB_OWNERSHIP[team?.id];
    const matches = teamMatchesResource.data?.matches || [];
    const homeAwayStats = calculateHomeAwayStats(matches, team?.id);
    return (
      <>
        <button type="button" className="back-link" onClick={() => setPage('teams')}>← กลับไปหน้าทีม</button>
        <PageHeading eyebrow="CLUB PROFILE" title={team?.name || 'รายละเอียดทีม'} description={team?.venue ? `สนามเหย้า ${team.venue}` : 'รายละเอียดที่มีให้ตามสิทธิ์ API'} actions={team && <Crest item={team} />} />
        {team && <div className="team-detail-actions">
          <button
            type="button"
            className={`secondary-button${favoriteTeamIds.includes(String(team.id)) ? ' is-favorite' : ''}`}
            onClick={() => toggleFavorite(team)}
            aria-pressed={favoriteTeamIds.includes(String(team.id))}
          >{favoriteTeamIds.includes(String(team.id)) ? '★ อยู่ในสโมสรโปรด' : '☆ เพิ่มในสโมสรโปรด'}</button>
        </div>}
        {mode === 'demo' && <StatusNotice status={{ kind: 'warning', message: 'รายละเอียดทีมในโหมด Demo มาจากข้อมูลตัวอย่างเท่านั้น' }} />}
        {renderResourceStatus(teamResource)}
        {teamResource.data && <div className="metric-grid">
          <MetricCard label="ชื่อย่อ" value={team.shortName || team.tla || '—'} note="ตามข้อมูลที่ API ส่งกลับ" icon="Aa" />
          <MetricCard label="รหัสสโมสร (TLA)" value={team.tla || team.code || '—'} note="รหัสย่อของสโมสรจาก API" icon="#" tone="blue" />
          <MetricCard label="โค้ช" value={team.coach?.name || (typeof team.coach === 'string' ? team.coach : 'ไม่มีข้อมูลจาก API')} note="ข้อมูลตามที่ API ส่งกลับ" icon="⚑" tone="orange" />
          <MetricCard
            label="เจ้าของสโมสร"
            value={ownership?.owner || 'ไม่มีข้อมูลที่ยืนยันได้'}
            note=""
            icon="♙"
            tone="orange"
            className="ownership-metric"
          />
          <MetricCard label="ประเทศ/พื้นที่" value={team.area?.name || '—'} note="ตามข้อมูลที่ API ส่งกลับ" icon="◎" tone="blue" />
          <MetricCard label="สนาม" value={team.venue || '—'} note="ข้อมูลอาจไม่มีในแพ็กเกจนี้" icon="⌂" tone="green" />
          <MetricCard label="เว็บไซต์" value={team.website ? <a href={team.website} target="_blank" rel="noreferrer">เปิดเว็บไซต์ ↗</a> : '—'} note="ตามข้อมูลที่ API ส่งกลับ" icon="↗" tone="orange" />
        </div>}
        <Card title="สถิติเหย้า–เยือน" subtitle={`คำนวณจากผลแข่งที่เสร็จแล้ว ${homeAwayStats.completedMatches} นัดที่ API ส่งกลับ`}>
          {renderResourceStatus(teamMatchesResource)}
          {teamMatchesResource.data && <div className="home-away-grid">
            {[
              ['เหย้า', homeAwayStats.home],
              ['เยือน', homeAwayStats.away]
            ].map(([label, record]) => (
              <section className="home-away-card" key={label}>
                <h3>{label}</h3>
                <div className="home-away-record">
                  <strong>{record.played}</strong><span>นัด</span>
                  <strong>{record.wins}-{record.draws}-{record.losses}</strong><span>ชนะ-เสมอ-แพ้</span>
                </div>
                <dl>
                  <div><dt>ประตูได้</dt><dd>{record.goalsFor}</dd></div>
                  <div><dt>ประตูเสีย</dt><dd>{record.goalsAgainst}</dd></div>
                  <div><dt>คะแนน</dt><dd>{record.points}</dd></div>
                </dl>
              </section>
            ))}
          </div>}
          {teamMatchesResource.data && <p className="quiet-note">นับเฉพาะแมตช์ FINISHED/AWARDED ที่มีสกอร์เต็มเวลาในข้อมูลที่โหลด ไม่รวมโปรแกรมที่ยังไม่แข่งขัน</p>}
        </Card>
        {teamResource.data && <TeamSquad team={team} />}
        {teamResource.data && <Card title="สถานะผู้เล่นบาดเจ็บ" subtitle="ข้อมูลความพร้อมของผู้เล่น">
          <div className="unavailable-panel">
            <strong>ไม่มีข้อมูลจาก API</strong>
            <p>Football-Data.org ไม่ได้ส่งสถานะการบาดเจ็บในข้อมูลทีมนี้ จึงไม่สามารถระบุรายชื่อผู้บาดเจ็บโดยไม่เดาข้อมูลได้</p>
          </div>
        </Card>}
        <Card title="การแข่งขันของทีม" subtitle="ผลและโปรแกรมที่ API เปิดให้เข้าถึง">
          {teamMatchesResource.data && <MatchTable matches={matches} onSelect={openMatch} />}
        </Card>
      </>
    );
  }

  function renderMatchDetail() {
    const match = matchResource.data || selectedMatch;
    const h2hMatches = (headToHeadResource.data?.matches || []).filter(match => match.competition?.code === 'PL');
    const finished = match && ['FINISHED', 'AWARDED'].includes(match.status);
    return (
      <>
        <button type="button" className="back-link" onClick={() => setPage('matches')}>← กลับไปหน้าการแข่งขัน</button>
        <PageHeading eyebrow="MATCH CENTER" title="รายละเอียดการแข่งขัน" description={match?.competition?.name || competitionLabel} />
        {mode === 'demo' && <StatusNotice status={{ kind: 'warning', message: 'รายละเอียดและประวัติ H2H เป็นตัวอย่างที่สร้างจากชุดข้อมูล Demo เท่านั้น' }} />}
        {renderResourceStatus(matchResource)}
        {match && <Card className="match-detail-card">
          <div className="match-detail-teams">
            <div><Crest item={match.homeTeam || {}} /><strong>{match.homeTeam?.name || 'เจ้าบ้าน'}</strong></div>
            <strong className="detail-score">{finished && match.score?.fullTime?.home != null ? `${match.score.fullTime.home} : ${match.score.fullTime.away}` : '— : —'}</strong>
            <div><Crest item={match.awayTeam || {}} /><strong>{match.awayTeam?.name || 'ทีมเยือน'}</strong></div>
          </div>
          <div className="detail-facts">
            <span>สถานะ <strong>{match.status || 'ไม่ระบุ'}</strong></span>
            <span>เวลา <strong>{match.utcDate ? new Date(match.utcDate).toLocaleString('th-TH') : 'ไม่ระบุ'}</strong></span>
            <span>นัดที่ <strong>{match.matchday || '—'}</strong></span>
            <span>สนาม <strong>{match.venue || 'ไม่มีข้อมูล'}</strong></span>
          </div>
          <p className="quiet-note">ไม่มีการสร้างข้อมูลเหตุการณ์สด รายชื่อผู้เล่น หรือสถิติที่ API ไม่ได้ส่งกลับ</p>
        </Card>}
        <Card title="พบกันก่อนหน้า (H2H)" subtitle="แสดงเฉพาะเมื่อ endpoint นี้พร้อมใช้งานในแพ็กเกจ">
          {renderResourceStatus(headToHeadResource)}
          {headToHeadResource.data && <MatchTable matches={h2hMatches} onSelect={openMatch} compact />}
        </Card>
      </>
    );
  }

  function renderSearch() {
    return (
      <>
        <PageHeading eyebrow="PREMIER LEAGUE SEARCH" title="ค้นหาพรีเมียร์ลีก" description="ค้นหาสโมสรและการแข่งขันใน Premier League" />
        <label className="search-box search-box-large"><span aria-hidden="true">⌕</span><input autoFocus type="search" value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="พิมพ์ชื่อทีม หรือชื่อคู่แข่งขัน..." /></label>
        <p className="dsa-feedback" role="status">ค้นหาสโมสรจากดัชนี substring ใน React; ค้นหาแมตช์จากข้อมูลที่ API ส่งกลับ</p>
        {mode === 'demo' && <StatusNotice status={{ kind: 'warning', message: 'ผลการค้นหาใช้ข้อมูลตัวอย่างที่มีในโหมด Demo เท่านั้น' }} />}
        {renderResourceStatus(teamsResource)}
        {renderResourceStatus(searchMatchesResource)}
        <div className="content-grid">
          <Card title={`ทีม (${filteredSearchTeams.length})`}><TeamGrid teams={searchText ? filteredSearchTeams : []} onSelect={openTeam} /></Card>
          <Card title={`การแข่งขัน (${searchText ? filteredSearchMatches.length : 0})`}>
            {searchText && renderResourceStatus(searchMatchesResource)}
            {searchText && <MatchTable matches={filteredSearchMatches} onSelect={openMatch} compact />}
            {!searchText && <div className="empty-inline">พิมพ์คำค้นหาเพื่อแสดงผลลัพธ์</div>}
          </Card>
        </div>
      </>
    );
  }

  function renderSettings() {
    const clearCache = () => {
      const keys = [];
      try {
        for (let index = 0; index < localStorage.length; index++) {
          const key = localStorage.key(index);
          if (key?.startsWith('football-dashboard-v2:')) keys.push(key);
        }
        keys.forEach(key => localStorage.removeItem(key));
        setRefreshKey(value => value + 1);
      } catch (error) {
        console.error('ล้าง cache ไม่สำเร็จ:', error);
      }
    };
    return (
      <>
        <PageHeading eyebrow="PREFERENCES" title="ตั้งค่า" description="เลือกแหล่งข้อมูลและตรวจสอบข้อจำกัดของ API" />
        <StatusNotice status={healthStatus} />
        <div className="settings-grid">
          <Card title="แหล่งข้อมูล" subtitle="เลือกข้อมูล API หรือชุดข้อมูลตัวอย่าง">
            <div className="mode-options">
              <button type="button" className={`mode-option${mode === 'live' ? ' selected' : ''}`} onClick={() => changeMode('live')}>
                <span className="mode-icon">◉</span><span><strong>Football-Data.org API</strong><small>{configured ? 'Token ถูกตั้งค่าบนเซิร์ฟเวอร์' : 'ต้องตั้งค่า FOOTBALL_DATA_TOKEN ก่อน'}</small></span><span>{mode === 'live' ? '●' : '○'}</span>
              </button>
              <button type="button" className={`mode-option${mode === 'demo' ? ' selected' : ''}`} onClick={() => changeMode('demo')}>
                <span className="mode-icon">▧</span><span><strong>โหมดตัวอย่าง (Demo)</strong><small>ข้อมูลตัวอย่างในโปรเจกต์ ไม่ใช่ข้อมูลสด</small></span><span>{mode === 'demo' ? '●' : '○'}</span>
              </button>
            </div>
            {!configured && <div className="setup-instructions">
              <strong>ตั้งค่า API token</strong>
              <code>FOOTBALL_DATA_TOKEN=ใส่_token_ใหม่_ที่นี่</code>
              <span>บันทึกในไฟล์ .env ที่ root ของโปรเจกต์ แล้วรีสตาร์ตเซิร์ฟเวอร์ ห้ามใส่ token ใน frontend หรือ commit ไฟล์ .env</span>
            </div>}
          </Card>
          <Card title="แพ็กเกจและข้อจำกัด">
            <ul className="limits-list">
              <li><span>แพ็กเกจที่แอปรองรับ</span><strong>Free Plan</strong></li>
              <li><span>คะแนนและโปรแกรม</span><strong>อาจล่าช้า</strong></li>
              <li><span>ขีดจำกัดต้นทาง</span><strong>10 requests / minute</strong></li>
              <li><span>ข้อมูลไม่รวม</span><strong>Live events, lineups, odds, player stats</strong></li>
              <li><span>H2H / team details</span><strong>ขึ้นกับสิทธิ์ token</strong></li>
            </ul>
            <a className="external-link" href="https://www.football-data.org/pricing" target="_blank" rel="noreferrer">ตรวจสอบแพ็กเกจทางการ ↗</a>
          </Card>
          <Card title="ข้อมูลสำรองเมื่อ API ขัดข้อง" subtitle="บันทึกข้อมูล API ล่าสุดไว้บนเซิร์ฟเวอร์">
            <p className="quiet-note">เมื่อเชื่อมต่อ API ไม่ได้ ระบบจะแสดงข้อมูลพรีเมียร์ลีกที่ดึงสำเร็จล่าสุด พร้อมเวลาอัปเดตและป้ายเตือนว่าเป็นข้อมูลสำรอง ข้อมูลสำรองเก็บในโฟลเดอร์ .cache ของเครื่องเซิร์ฟเวอร์และไม่ถูก commit</p>
          </Card>
          <Card title="หน้าตา">
            <button type="button" className="secondary-button" onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}>
              เปลี่ยนเป็นธีม{theme === 'dark' ? 'สว่าง' : 'มืด'}
            </button>
          </Card>
          <Card title="ข้อมูลที่บันทึกไว้" subtitle="Cache ในเบราว์เซอร์">
            <button type="button" className="secondary-button" onClick={clearCache}>ล้างข้อมูล cache</button>
          </Card>
        </div>
      </>
    );
  }

  const view = {
    home: renderHome,
    matches: renderMatches,
    standings: renderStandings,
    teams: renderTeams,
    team: renderTeamDetail,
    match: renderMatchDetail,
    search: renderSearch,
    settings: renderSettings
  }[page] || renderHome;
  const [eyebrow, title] = PAGE_META[page] || PAGE_META.home;

  return (
    <div className="app-shell">
      {mode === 'demo' && <div className="demo-ribbon"><span>DEMO</span> ข้อมูลตัวอย่าง ไม่ใช่ข้อมูลสด</div>}
      <Sidebar page={page} onNavigate={setPage} mode={mode} configured={configured} />
      <main className="main-content">
        <div className="topbar">
          <div className="breadcrumbs"><span>Premier League</span><span>/</span><strong>{title || eyebrow}</strong></div>
          <div className="topbar-actions">
            <button type="button" className="topbar-search" onClick={() => setPage('search')} aria-label="ไปหน้าค้นหา">⌕ <span>ค้นหา</span><kbd>⌘ K</kbd></button>
            <span className={`connection-indicator ${mode === 'demo' ? 'is-demo' : configured ? 'is-live' : 'is-offline'}`}><i />{mode === 'demo' ? 'DEMO' : configured ? 'API' : 'NO TOKEN'}</span>
            <button type="button" className="avatar-button" onClick={() => setPage('settings')} aria-label="ตั้งค่า">⚙</button>
          </div>
        </div>
        <div className="page-content">{view()}</div>
        <footer className="app-footer">ข้อมูลพรีเมียร์ลีกจาก football-data.org • คะแนน/โปรแกรมอาจล่าช้าใน Free Plan</footer>
      </main>
      <MobileNav page={page} onNavigate={setPage} />
    </div>
  );
}

export default DashboardApp;
