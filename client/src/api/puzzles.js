const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE = (
  isLocalHost
    ? (window.location.port === '3000' ? 'http://localhost:5000' : '')
    : (process.env.REACT_APP_API_URL || '')
).replace(/\/+$/, '');

async function readJson(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.detail || payload.error || 'Puzzle request failed';
    throw new Error(message);
  }

  return payload;
}

export async function fetchPuzzles(limit = 15, maxRating = 2100) {
  const response = await fetch(
    `${API_BASE}/api/puzzles?limit=${limit}&max_rating=${maxRating}`
  );
  return readJson(response);
}

export async function fetchPuzzle(id) {
  const response = await fetch(`${API_BASE}/api/puzzles/${encodeURIComponent(id)}`);
  return readJson(response);
}

export async function fetchSimilarPuzzles(id, limit = 15, maxRating = 3000) {
  const response = await fetch(
    `${API_BASE}/api/puzzles/${encodeURIComponent(id)}/similar?limit=${limit}&max_rating=${maxRating}`
  );
  return readJson(response);
}

export function prefetchSimilarPuzzles(id) {
  fetch(`${API_BASE}/api/puzzles/${encodeURIComponent(id)}/prefetch`, {
    method: 'POST',
  }).catch(() => {});
}
