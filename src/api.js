import { getDemoResponse } from './demo.js';

const CACHE_PREFIX = 'football-dashboard-v2:';

function readCache(path) {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_PREFIX + path));
    return saved?.data ? saved : null;
  } catch (error) {
    console.warn('อ่านข้อมูลสำรองในเบราว์เซอร์ไม่สำเร็จ:', error);
    return null;
  }
}

function writeCache(path, data, savedAt) {
  try {
    localStorage.setItem(CACHE_PREFIX + path, JSON.stringify({
      savedAt: savedAt || new Date().toISOString(),
      data
    }));
  } catch (error) {
    console.warn('บันทึกข้อมูลสำรองในเบราว์เซอร์ไม่สำเร็จ:', error);
  }
}

export async function getApiHealth(signal) {
  const response = await fetch('/api/health', { signal });
  if (!response.ok) throw new Error(`API health check failed (HTTP ${response.status})`);
  return response.json();
}

export async function getDashboardData(path, { mode = 'live', signal } = {}) {
  if (mode === 'demo') {
    const data = getDemoResponse(path);
    return { data, source: 'demo', savedAt: null };
  }

  const response = await fetch(path, { signal });
  if (!response.ok) {
    let message = `คำขอไม่สำเร็จ (HTTP ${response.status})`;
    try {
      const body = await response.json();
      message = body.error || message;
    } catch (error) {
      console.warn('อ่านรายละเอียดข้อผิดพลาดจาก API ไม่สำเร็จ:', error);
    }

    const apiError = new Error(message);
    apiError.status = response.status;
    apiError.unavailable = response.status === 403 || response.status === 404;
    apiError.rateLimited = response.status === 429;
    apiError.retryAfter = response.headers.get('Retry-After');
    throw apiError;
  }

  const data = await response.json();
  const savedAt = response.headers.get('X-Data-Saved-At');
  const source = response.headers.get('X-Data-Source');
  writeCache(path, data, savedAt);
  return {
    data,
    source: source === 'cache' || source === 'backup' ? source : 'live',
    savedAt: savedAt || new Date().toISOString()
  };
}

export function getStaleDashboardData(path) {
  return readCache(path);
}
