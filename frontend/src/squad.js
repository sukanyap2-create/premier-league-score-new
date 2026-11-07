const POSITION_GROUPS = [
  { key: 'Goalkeeper', label: 'ผู้รักษาประตู' },
  { key: 'Defence', label: 'กองหลัง' },
  { key: 'Midfield', label: 'กองกลาง' },
  { key: 'Offence', label: 'กองหน้า' }
];

export function groupSquadByPosition(squad) {
  const grouped = POSITION_GROUPS.map(group => ({
    ...group,
    players: []
  }));

  for (const player of Array.isArray(squad) ? squad : []) {
    const group = grouped.find(item => item.key === player.position);
    if (group) group.players.push(player);
  }

  return grouped.filter(group => group.players.length > 0);
}

export function isSquadDataStale(lastUpdated, now = Date.now()) {
  const timestamp = Date.parse(lastUpdated || '');
  return !Number.isFinite(timestamp) || now - timestamp > 90 * 24 * 60 * 60 * 1000;
}

export function formatSquadUpdatedAt(lastUpdated) {
  const timestamp = Date.parse(lastUpdated || '');
  if (!Number.isFinite(timestamp)) return 'ไม่ระบุวันที่อัปเดต';
  return new Date(timestamp).toLocaleDateString('th-TH', { dateStyle: 'long' });
}
