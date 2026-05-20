import { useEffect, useMemo, useState } from 'react';
import { createStockfishWorker, terminateStockfishWorker } from '../utils/stockfish';

const EMPTY_SHAPES = [];
const EMPTY_BRUSHES = {};
const ENGINE_COLORS = ['#81b64c', '#f2c14e', '#5aa2e8'];

function parseScoreValue(line) {
  const cpMatch = line.match(/\bscore cp (-?\d+)/);
  if (cpMatch) return Number(cpMatch[1]);

  const mateMatch = line.match(/\bscore mate (-?\d+)/);
  if (!mateMatch) return null;

  const mate = Number(mateMatch[1]);
  return mate > 0 ? 100000 - Math.abs(mate) : -100000 + Math.abs(mate);
}

export function useEngineArrows({ fen, enabled, depth = 6 }) {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !fen || document.hidden) {
      setLines(EMPTY_SHAPES);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    let workerRef = null;
    let analysisStarted = false;
    let startTimer = null;
    const byRank = new Map();

    const stopWorker = (updateState = true) => {
      if (startTimer) {
        window.clearTimeout(startTimer);
        startTimer = null;
      }
      terminateStockfishWorker(workerRef);
      workerRef = null;
      if (updateState) setLoading(false);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) return;
      cancelled = true;
      setLines(EMPTY_SHAPES);
      stopWorker();
    };

    setLines(EMPTY_SHAPES);
    setLoading(true);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    createStockfishWorker({ liteOnly: true })
      .then(({ worker }) => {
        if (cancelled) {
          terminateStockfishWorker(worker);
          return;
        }

        workerRef = worker;

        const startAnalysis = () => {
          if (cancelled || analysisStarted) return;
          analysisStarted = true;
          worker.postMessage(`position fen ${fen}`);
          worker.postMessage(`go depth ${depth}`);
        };

        worker.onmessage = (event) => {
          if (cancelled) return;

          const line = String(event.data);

          if (line === 'uciok') {
            worker.postMessage('setoption name MultiPV value 3');
            worker.postMessage('isready');
            return;
          }

          if (line === 'readyok') {
            startAnalysis();
            return;
          }

          if (line.startsWith('bestmove')) {
            setLines(
              Array.from(byRank.values())
                .sort((a, b) => a.rank - b.rank)
                .slice(0, 3)
            );
            setLoading(false);
            return;
          }

          if (!line.includes(' pv ') || !line.includes(' score ')) return;

          const value = parseScoreValue(line);
          const pv = line.split(' pv ')[1] || '';
          const move = pv.split(/\s+/)[0] || '';
          if (value == null || move.length < 4) return;

          const rank = Number(line.match(/\bmultipv (\d+)/)?.[1] || 1);
          if (rank < 1 || rank > 3) return;

          byRank.set(rank, { rank, move, value });
        };

        worker.postMessage('uci');
        worker.postMessage('setoption name MultiPV value 3');
        worker.postMessage('isready');
        startTimer = window.setTimeout(startAnalysis, 350);
      })
      .catch((error) => {
        console.warn(error.message);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopWorker(false);
    };
  }, [depth, enabled, fen]);

  return useMemo(() => {
    if (!enabled || lines.length === 0) {
      return { shapes: EMPTY_SHAPES, brushes: EMPTY_BRUSHES, lines: EMPTY_SHAPES, loading };
    }

    const values = lines.map((line) => line.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    const weightedLines = lines.map((line, index) => {
      const relativeWeight = range > 0 ? (line.value - min) / range : 1 - index * 0.18;
      return {
        ...line,
        weight: Math.max(0.42, Math.min(1, relativeWeight)),
      };
    });

    const brushes = {};
    const shapes = weightedLines.map((line, index) => {
      const brush = `engineArrow${line.rank}`;
      brushes[brush] = {
        key: `ea${line.rank}-${Math.round(line.weight * 100)}`,
        color: ENGINE_COLORS[index] || ENGINE_COLORS[2],
        opacity: 0.38 + line.weight * 0.42,
        lineWidth: Math.round(7 + line.weight * 8),
      };

      return {
        orig: line.move.slice(0, 2),
        dest: line.move.slice(2, 4),
        brush,
      };
    });

    return { shapes, brushes, lines: weightedLines, loading };
  }, [enabled, lines, loading]);
}
