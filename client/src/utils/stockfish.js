export const MIN_ANALYSIS_DEPTH = 4;
export const MAX_ANALYSIS_DEPTH = 12;
export const DEFAULT_ANALYSIS_DEPTH = 6;

const ANALYSIS_DEPTH_KEY = 'e4square-analysis-depth';
const STOCKFISH_LEASE_PREFIX = 'e4square-stockfish-lease';
const STOCKFISH_LEASE_TTL_MS = 5000;
const STOCKFISH_LEASE_HEARTBEAT_MS = 1000;
const STOCKFISH_LOAD_TIMEOUT_MS = 12000;

const tabId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const isMobileDevice = () =>
  navigator.userAgentData?.mobile ?? /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export function clampAnalysisDepth(value) {
  const depth = Number.parseInt(value, 10);
  if (!Number.isFinite(depth)) return DEFAULT_ANALYSIS_DEPTH;
  return Math.max(MIN_ANALYSIS_DEPTH, Math.min(MAX_ANALYSIS_DEPTH, depth));
}

export function getStoredAnalysisDepth() {
  if (typeof window === 'undefined') return DEFAULT_ANALYSIS_DEPTH;

  try {
    return clampAnalysisDepth(window.localStorage.getItem(ANALYSIS_DEPTH_KEY));
  } catch {
    return DEFAULT_ANALYSIS_DEPTH;
  }
}

export function storeAnalysisDepth(value) {
  const depth = clampAnalysisDepth(value);

  try {
    window.localStorage.setItem(ANALYSIS_DEPTH_KEY, String(depth));
  } catch {
    // Local storage can be unavailable in private or restricted contexts.
  }

  return depth;
}

export class StockfishBusyError extends Error {
  constructor(scope) {
    super(`Stockfish ${scope} is already running in another tab.`);
    this.name = 'StockfishBusyError';
    this.scope = scope;
  }
}

function getLeaseKey(scope) {
  return `${STOCKFISH_LEASE_PREFIX}:${scope}`;
}

function readLease(scope) {
  try {
    const raw = window.localStorage.getItem(getLeaseKey(scope));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function isFreshLease(lease, now = Date.now()) {
  return lease?.updatedAt && now - lease.updatedAt < STOCKFISH_LEASE_TTL_MS;
}

function acquireStockfishLease(scope) {
  if (!scope || typeof window === 'undefined') {
    return { release: () => {} };
  }

  try {
    const now = Date.now();
    const current = readLease(scope);
    if (current?.ownerId !== tabId && isFreshLease(current, now)) {
      return null;
    }

    const token = `${tabId}:${scope}:${now}:${Math.random().toString(36).slice(2)}`;
    const lease = {
      ownerId: tabId,
      token,
      scope,
      createdAt: now,
      updatedAt: now,
    };

    window.localStorage.setItem(getLeaseKey(scope), JSON.stringify(lease));

    if (readLease(scope)?.token !== token) {
      return null;
    }

    let released = false;
    let heartbeat = null;

    const release = () => {
      if (released) return;
      released = true;

      if (heartbeat) {
        window.clearInterval(heartbeat);
        heartbeat = null;
      }

      window.removeEventListener('pagehide', release);

      try {
        if (readLease(scope)?.token === token) {
          window.localStorage.removeItem(getLeaseKey(scope));
        }
      } catch {
        // Ignore storage cleanup failures.
      }
    };

    heartbeat = window.setInterval(() => {
      try {
        const latest = readLease(scope);
        if (latest?.token !== token) {
          release();
          return;
        }

        window.localStorage.setItem(
          getLeaseKey(scope),
          JSON.stringify({ ...latest, updatedAt: Date.now() })
        );
      } catch {
        release();
      }
    }, STOCKFISH_LEASE_HEARTBEAT_MS);

    window.addEventListener('pagehide', release);

    return { release };
  } catch {
    return { release: () => {} };
  }
}

function loadVerifiedWorker(path, timeoutMs = STOCKFISH_LOAD_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let worker = null;
    let settled = false;
    let timeout = null;

    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      if (timeout) window.clearTimeout(timeout);

      if (worker) {
        worker.onmessage = null;
        worker.onerror = null;
      }

      callback(value);
    };

    try {
      worker = new Worker(path, { name: `e4square-${path.includes('lite') ? 'analysis' : 'stockfish'}` });
    } catch (error) {
      reject(error);
      return;
    }

    timeout = window.setTimeout(() => {
      const error = new Error(`Timed out while loading ${path}`);
      try {
        worker.terminate();
      } catch {
        // Ignore termination failures.
      }
      settle(reject, error);
    }, timeoutMs);

    worker.onerror = (event) => {
      const error = new Error(event?.message || `Failed to load ${path}`);
      try {
        worker.terminate();
      } catch {
        // Ignore termination failures.
      }
      settle(reject, error);
    };

    worker.onmessage = (event) => {
      if (String(event.data) === 'uciok') {
        settle(resolve, worker);
      }
    };

    worker.postMessage('uci');
  });
}

export const createStockfishWorker = async ({ liteOnly = false, scope = null, timeoutMs } = {}) => {
  const lease = acquireStockfishLease(scope);
  if (!lease) {
    throw new StockfishBusyError(scope);
  }

  const paths = liteOnly || isMobileDevice()
    ? ['/stockfish/stockfish-17-lite.js']
    : ['/stockfish/stockfish-17.js', '/stockfish/stockfish-17-lite.js'];

  let lastError = null;

  for (const path of paths) {
    try {
      const worker = await loadVerifiedWorker(path, timeoutMs);
      Object.defineProperty(worker, '__releaseStockfishLease', {
        value: lease.release,
        configurable: true,
      });
      return { worker, path, release: lease.release };
    } catch (err) {
      lastError = err;
      console.warn(`[Stockfish] Failed to load ${path}:`, err);
    }
  }

  lease.release();
  throw new Error(`Failed to load any Stockfish engine${lastError ? `: ${lastError.message}` : ''}`);
};

export function terminateStockfishWorker(worker) {
  if (!worker) return;

  try {
    worker.onmessage = null;
    worker.onerror = null;
    worker.postMessage('stop');
    worker.postMessage('quit');
  } catch {
    // The worker may already be gone.
  }

  const terminate = () => {
    try {
      worker.terminate();
    } catch {
      // Ignore double termination.
    }

    try {
      worker.__releaseStockfishLease?.();
    } catch {
      // Ignore lease cleanup failures.
    }
  };

  if (typeof window !== 'undefined') {
    window.setTimeout(terminate, 25);
    return;
  }

  terminate();
}

export function parseStockfishScore(line, turn = 'w') {
  const cpMatch = line.match(/score cp (-?\d+)/);
  if (cpMatch) {
    const rawCp = Number(cpMatch[1]);
    const cp = turn === 'w' ? rawCp : -rawCp;
    return {
      type: 'cp',
      cp,
      display: `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(1)}`,
    };
  }

  const mateMatch = line.match(/score mate (-?\d+)/);
  if (mateMatch) {
    const rawMate = Number(mateMatch[1]);
    const mate = turn === 'w' ? rawMate : -rawMate;
    return {
      type: 'mate',
      mate,
      display: `${mate >= 0 ? '+' : '-'}M${Math.abs(mate)}`,
    };
  }

  return null;
}
