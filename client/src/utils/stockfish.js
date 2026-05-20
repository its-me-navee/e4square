const isMobileDevice = () =>
  navigator.userAgentData?.mobile ?? /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export const createStockfishWorker = async ({ liteOnly = false } = {}) => {
  const paths = liteOnly || isMobileDevice()
    ? ['/stockfish/stockfish-17-lite.js']
    : ['/stockfish/stockfish-17.js', '/stockfish/stockfish-17-lite.js'];

  for (const path of paths) {
    try {
      const worker = new Worker(path);
      return { worker, path };
    } catch (err) {
      console.warn(`[Stockfish] Failed to load ${path}:`, err);
    }
  }

  throw new Error('Failed to load any Stockfish engine');
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
