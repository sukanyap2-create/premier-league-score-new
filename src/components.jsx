import React, { useState } from 'react';
import { mergeSort } from './dsa.mjs';

export const PAGE_META = {
  home: ['PREMIER LEAGUE', 'พรีเมียร์ลีก'],
  matches: ['PREMIER LEAGUE', 'โปรแกรมและผลการแข่งขัน'],
  standings: ['PREMIER LEAGUE', 'ตารางคะแนน'],
  teams: ['PREMIER LEAGUE CLUBS', 'สโมสร'],
  team: ['PREMIER LEAGUE CLUBS', 'รายละเอียดสโมสร'],
  match: ['PREMIER LEAGUE', 'รายละเอียดการแข่งขัน'],
  search: ['PREMIER LEAGUE', 'ค้นหา'],
  settings: ['Settings', 'ตั้งค่า']
};

const NAV_ITEMS = [
  ['home', '⌂', 'พรีเมียร์ลีก'],
  ['matches', '◷', 'โปรแกรม/ผล'],
  ['standings', '☷', 'ตารางคะแนน'],
  ['teams', '♧', 'สโมสร'],
  ['search', '⌕', 'ค้นหา']
];

export function Sidebar({ page, onNavigate, mode, configured }) {
  return (
    <aside className="sidebar">
      <a className="brand" href="#home" onClick={event => { event.preventDefault(); onNavigate('home'); }}>
        <span className="brand-mark">⚽</span>
        <span><strong>Premier League</strong><small>SEASON DASHBOARD</small></span>
      </a>
      <div className="sidebar-label">เมนูหลัก</div>
      <nav className="side-nav" aria-label="เมนูหลัก">
        {NAV_ITEMS.map(([id, icon, label]) => (
          <button
            type="button"
            className={`nav-item${page === id || (id === 'teams' && page === 'team') || (id === 'matches' && page === 'match') ? ' active' : ''}`}
            aria-current={page === id ? 'page' : undefined}
            key={id}
            onClick={() => onNavigate(id)}
          >
            <span className="nav-icon" aria-hidden="true">{icon}</span>{label}
          </button>
        ))}
      </nav>
      <div className="sidebar-spacer" />
      <div className={`plan-card ${mode === 'demo' ? 'demo' : ''}`}>
        <span className="plan-dot" />
        <div><strong>{mode === 'demo' ? 'โหมดตัวอย่าง' : configured ? 'Free plan' : 'ยังไม่ตั้งค่า API'}</strong>
          <small>{mode === 'demo' ? 'ข้อมูลตัวอย่างเท่านั้น' : 'ข้อมูลอาจล่าช้า'}</small></div>
      </div>
      <button type="button" className={`nav-item settings-link${page === 'settings' ? ' active' : ''}`} onClick={() => onNavigate('settings')}>
        <span className="nav-icon" aria-hidden="true">⚙</span>ตั้งค่า
      </button>
      <div className="sidebar-footer">ข้อมูลพรีเมียร์ลีก • football-data.org</div>
    </aside>
  );
}

export function MobileNav({ page, onNavigate }) {
  return (
    <nav className="mobile-nav" aria-label="เมนูหลัก">
      {NAV_ITEMS.slice(0, 5).map(([id, icon, label]) => (
        <button type="button" className={page === id ? 'active' : ''} key={id} onClick={() => onNavigate(id)}>
          <span aria-hidden="true">{icon}</span><small>{label}</small>
        </button>
      ))}
    </nav>
  );
}

export function StatusNotice({ status }) {
  if (!status) return null;
  return (
    <div className={`notice notice-${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'} aria-live="polite">
      <span className="notice-icon" aria-hidden="true">{status.kind === 'error' ? '!' : status.kind === 'loading' ? '◌' : status.kind === 'unavailable' ? 'ⓘ' : '•'}</span>
      <span>{status.message}</span>
    </div>
  );
}

export function PageHeading({ eyebrow, title, description, actions }) {
  return (
    <div className="page-heading">
      <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && <div className="panel-heading"><div>{title && <h2>{title}</h2>}{subtitle && <p>{subtitle}</p>}</div>{action}</div>}
      {children}
    </section>
  );
}

export function MetricCard({ label, value, note, icon, tone = 'violet', className = '' }) {
  return (
    <div className={`metric-card tone-${tone} ${className}`.trim()}>
      <div className="metric-top"><span>{label}</span><span className="metric-icon" aria-hidden="true">{icon}</span></div>
      <strong>{value ?? '—'}</strong><small>{note}</small>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }) {
  if (!total || total <= pageSize) return null;
  const pages = Math.ceil(total / pageSize);
  return (
    <div className="pagination">
      <span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} จาก {total}</span>
      <div>
        <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>ก่อนหน้า</button>
        <span>หน้า {page} / {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)}>ถัดไป</button>
      </div>
    </div>
  );
}

export function MatchTable({ matches, onSelect, compact = false }) {
  if (!matches?.length) return <div className="empty-inline">ไม่มีรายการแข่งขันในตัวกรองนี้</div>;
  const statusLabels = {
    FINISHED: 'จบแล้ว', AWARDED: 'จบแล้ว', LIVE: 'สด', IN_PLAY: 'กำลังแข่ง',
    PAUSED: 'พัก', SCHEDULED: 'รอแข่ง', TIMED: 'รอแข่ง',
    POSTPONED: 'เลื่อน', SUSPENDED: 'ระงับ', CANCELLED: 'ยกเลิก'
  };
  return (
    <div className="match-list">
      {matches.map((match, index) => {
        const status = match.status || 'SCHEDULED';
        const finished = ['FINISHED', 'AWARDED'].includes(status);
        const context = match.competition?.name || match.competitionName || (match.matchday ? `นัดที่ ${match.matchday}` : 'การแข่งขัน');
        const score = finished && match.score?.fullTime?.home != null
          ? `${match.score.fullTime.home} : ${match.score.fullTime.away}`
          : '— : —';
        return (
          <button
            type="button"
            className={`match-card${compact ? ' compact' : ''}`}
            key={match.id || `${match.utcDate}-${index}`}
            onClick={() => onSelect?.(match)}
            disabled={!onSelect}
          >
            <span className="match-meta">
              <span>{context}</span>
              <time dateTime={match.utcDate || undefined}>
                {match.utcDate ? new Date(match.utcDate).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : 'ไม่ระบุเวลา'}
              </time>
            </span>
            <span className="match-side home-side"><span>{match.homeTeam?.name || 'เจ้าบ้าน'}</span>{match.homeTeam?.crest && <img src={match.homeTeam.crest} alt="" />}</span>
            <strong className="match-result">{score}</strong>
            <span className="match-side away-side">{match.awayTeam?.crest && <img src={match.awayTeam.crest} alt="" />}<span>{match.awayTeam?.name || 'ทีมเยือน'}</span></span>
            <span className={`status-pill status-${status.toLowerCase()}`}>{statusLabels[status] || status}</span>
            {onSelect && <span className="match-arrow" aria-hidden="true">›</span>}
          </button>
        );
      })}
    </div>
  );
}

export function StandingsTable({ standings, onSelectTeam, favoriteTeamIds = [], onToggleFavorite }) {
  const rows = standings?.table || [];
  const [sortBy, setSortBy] = useState('position');
  if (!rows.length) return <div className="empty-inline">ไม่มีข้อมูลตารางคะแนน</div>;
  const hasForm = rows.some(row => typeof row.form === 'string' && row.form.length > 0);
  const sortedRows = sortBy === 'position'
    ? rows
    : mergeSort(rows, (left, right) => (right[sortBy] ?? 0) - (left[sortBy] ?? 0));
  return (
    <>
    <div className="table-sort-control">
      <label htmlFor="standings-sort">เรียงตาราง</label>
      <select id="standings-sort" value={sortBy} onChange={event => setSortBy(event.target.value)}>
        <option value="position">อันดับทางการ</option>
        <option value="points">คะแนน</option>
        <option value="won">จำนวนชนะ</option>
        <option value="goalDifference">ผลต่างประตู</option>
        <option value="goalsFor">ประตูได้</option>
      </select>
      <span>{sortBy === 'position' ? 'เรียงตามอันดับที่ API ส่งมา' : 'เรียงด้วย Merge Sort แบบ stable; อันดับทางการยังคงแสดงเดิม'}</span>
    </div>
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th>อันดับ</th><th>ทีม</th><th>แข่ง</th><th>ชนะ</th><th>เสมอ</th><th>แพ้</th><th>ได้/เสีย</th><th>ผลต่าง</th>{hasForm && <th>ฟอร์ม 5 นัด</th>}<th>คะแนน</th>{onToggleFavorite && <th>โปรด</th>}</tr></thead>
        <tbody>
          {sortedRows.map((row, index) => {
            const team = row.team || {};
            const isFavorite = favoriteTeamIds.includes(String(team.id));
            const form = typeof row.form === 'string' ? row.form.split(',').filter(Boolean).slice(-5) : [];
            return (
              <tr key={team.id || team.name || index}>
                <td><span className={`rank-badge ${row.position <= 4 ? 'top-rank' : ''}`}>{row.position || index + 1}</span></td>
                <td><button className="table-team" type="button" disabled={!team.id || !onSelectTeam} onClick={() => onSelectTeam?.(team)}>
                  <Crest item={team} /><span>{team.name || 'ไม่ทราบชื่อทีม'}</span>
                </button></td>
                <td>{row.playedGames ?? '—'}</td><td>{row.won ?? '—'}</td><td>{row.draw ?? '—'}</td><td>{row.lost ?? '—'}</td>
                <td>{row.goalsFor ?? '—'} / {row.goalsAgainst ?? '—'}</td><td>{row.goalDifference ?? '—'}</td>
                {hasForm && <td><span className="form-list" aria-label={form.length ? `ฟอร์ม ${form.join(', ')}` : 'ไม่มีข้อมูลฟอร์ม'}>
                  {form.length ? form.map((result, resultIndex) => {
                    const normalized = result.toUpperCase();
                    const label = normalized === 'W' ? 'ชนะ' : normalized === 'D' ? 'เสมอ' : normalized === 'L' ? 'แพ้' : result;
                    return <span className={`form-result form-${normalized}`} key={`${result}-${resultIndex}`} title={label}>{normalized}</span>;
                  }) : '—'}
                </span></td>}
                <td><strong className="points">{row.points ?? '—'}</strong></td>
                  {onToggleFavorite && <td><button
                    type="button"
                    className={`favorite-toggle${isFavorite ? ' is-favorite' : ''}`}
                    aria-label={`${isFavorite ? 'นำออกจาก' : 'เพิ่มใน'}สโมสรโปรด: ${team.name || 'ทีม'}`}
                    aria-pressed={isFavorite}
                    onClick={() => onToggleFavorite(team)}
                  >{isFavorite ? '★' : '☆'}</button></td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}

export function Crest({ item }) {
  const image = item.crest || item.crestUrl || item.emblem;
  const name = item.name || '?';
  return image
    ? <img className="crest-image" src={image} alt="" loading="lazy" onError={event => { event.currentTarget.style.visibility = 'hidden'; }} />
    : <span className="crest-placeholder" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>;
}

export function TeamGrid({ teams, onSelect }) {
  if (!teams?.length) return <div className="empty-inline">ไม่พบข้อมูลทีมสำหรับรายการนี้</div>;
  return (
    <div className="team-grid">
      {teams.map((team, index) => (
        <button type="button" className="team-card" key={team.id || team.name || index} onClick={() => onSelect?.(team)} disabled={!onSelect}>
          <Crest item={team} /><span className="team-card-name">{team.name || 'ทีม'}</span>
          <span className="team-card-meta">{team.shortName || team.tla || team.area?.name || 'ทีมแข่งขัน'}</span>
          {team.venue && <span className="team-card-meta">{team.venue}</span>}
        </button>
      ))}
    </div>
  );
}

export function PointsChart({ rows, limit = 8 }) {
  if (!rows?.length) return <div className="empty-inline">ไม่มีข้อมูลเพียงพอสำหรับกราฟ</div>;
  const points = rows.slice().sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, limit);
  const max = Math.max(1, ...points.map(row => row.points || 0));
  return (
    <div className="bar-chart" role="img" aria-label={`กราฟคะแนน ${points.length} สโมสรที่มีคะแนนสูงสุด`}>
      {points.map((row, index) => (
        <div className="bar-row" key={row.team?.id || row.team?.name || index}>
          <span title={row.team?.name}>{row.team?.shortName || row.team?.name || 'ทีม'}</span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(3, ((row.points || 0) / max) * 100)}%` }} /></div>
          <strong>{row.points ?? '—'}</strong>
        </div>
      ))}
      <small>แสดง {points.length} อันดับแรก • คำนวณจากคะแนนในตารางที่ API ส่งมา</small>
    </div>
  );
}
