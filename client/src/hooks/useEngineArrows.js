import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  clampAnalysisDepth,
  createStockfishWorker,
  parseStockfishScore,
  StockfishBusyError,
  terminateStockfishWorker,
} from '../utils/stockfish';

const EMPTY_LINES = [];
const EMPTY_SHAPES = [];
const EMPTY_BRUSHES = {};
const ENGINE_COLORS = ['#81b64c', '#f2c14e', '#5aa2e8'];
const BUSY_RETRY_MS = 5500;

function parseScoreValue(line) {
  const cpMatch = line.match(/\bscore cp (-?\d+)/);
  if (cpMatch) return Number(cpMatch[1]);

  const mateMatch = line.match(/\bscore mate (-?\d+)/);
  if (!mateMatch) return null;

  const mate = Number(mateMatch[1]);
  return mate > 0 ? 100000 - Math.abs(mate) : -100000 + Math.abs(mate);
}

function getFenTurn(fen) {
  return fen.split(/\s+/)[1] || 'w';
}

export function useEngineArrows({ fen, enabled, depth = 6, arrows = true }) {
  const workerRef = useRef(null);
  const readyRef = useRef(false);
  const loadingRef = useRef(false);
  const startingRef = useRef(false);
  const arrowsRef = useRef(Boolean(arrows));
  const byRankRef = useRef(new Map());
  const startTimerRef = useRef(null);
  const ignoreBestMoveRef = useRef(0);
  const latestFenRef = useRef('');
  const latestDepthRef = useRef(clampAnalysisDepth(depth));

  const [lines, setLines] = useState(EMPTY_LINES);
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [readyKey, setReadyKey] = useState(0);
  const [wakeKey, setWakeKey] = useState(0);
  const [unavailableReason, setUnavailableReason] = useState('');

  const clearStartTimer = useCallback(() => {
    if (!startTimerRef.current) return;
    window.clearTimeout(startTimerRef.current);
    startTimerRef.current = null;
  }, []);

  const resetAnalysisState = useCallback(() => {
    byRankRef.current = new Map();
    setLines(EMPTY_LINES);
    setEvaluation(null);
    setLoading(false);
    loadingRef.current = false;
  }, []);

  const stopWorker = useCallback((resetState = true) => {
    clearStartTimer();
    readyRef.current = false;
    startingRef.current = false;
    ignoreBestMoveRef.current = 0;
    terminateStockfishWorker(workerRef.current);
    workerRef.current = null;

    if (resetState) {
      resetAnalysisState();
    }
  }, [clearStartTimer, resetAnalysisState]);

  const startAnalysis = useCallback(() => {
    const worker = workerRef.current;
    const boardFen = latestFenRef.current;
    const searchDepth = latestDepthRef.current;

    clearStartTimer();

    if (!worker || !readyRef.current || !boardFen || document.hidden) return;

    if (loadingRef.current) {
      ignoreBestMoveRef.current += 1;
      worker.postMessage('stop');
    }

    byRankRef.current = new Map();
    setLines(EMPTY_LINES);
    setEvaluation(null);
    setUnavailableReason('');
    setLoading(true);
    loadingRef.current = true;

    startTimerRef.current = window.setTimeout(() => {
      if (!workerRef.current || workerRef.current !== worker || document.hidden) return;
      worker.postMessage(`setoption name MultiPV value ${arrowsRef.current ? 3 : 1}`);
      worker.postMessage(`position fen ${boardFen}`);
      worker.postMessage(`go depth ${searchDepth}`);
    }, 30);
  }, [clearStartTimer]);

  const shouldRun = enabled && Boolean(fen);

  useEffect(() => {
    latestFenRef.current = shouldRun ? fen : '';
    latestDepthRef.current = clampAnalysisDepth(depth);
    arrowsRef.current = Boolean(arrows);
  }, [arrows, depth, fen, shouldRun]);

  useEffect(() => {
    if (!shouldRun || document.hidden) {
      if (!shouldRun) setUnavailableReason('');
      stopWorker();
      return;
    }

    if (workerRef.current || startingRef.current) return;

    let cancelled = false;
    let retryTimer = null;
    startingRef.current = true;
    setUnavailableReason('');
    setLoading(true);

    createStockfishWorker({ liteOnly: true, scope: 'analysis' })
      .then(({ worker }) => {
        if (cancelled) {
          startingRef.current = false;
          terminateStockfishWorker(worker);
          return;
        }

        workerRef.current = worker;
        startingRef.current = false;

        worker.onmessage = (event) => {
          const line = String(event.data);

          if (line === 'readyok') {
            readyRef.current = true;
            setReadyKey((key) => key + 1);
            return;
          }

          if (line.startsWith('bestmove')) {
            if (ignoreBestMoveRef.current > 0) {
              ignoreBestMoveRef.current -= 1;
              return;
            }

            const rankedLines = Array.from(byRankRef.current.values())
              .sort((a, b) => a.rank - b.rank)
              .slice(0, 3);

            setLines(rankedLines.length > 0 ? rankedLines : EMPTY_LINES);
            setLoading(false);
            loadingRef.current = false;
            return;
          }

          if (!line.includes(' score ')) return;

          const score = parseStockfishScore(line, getFenTurn(latestFenRef.current));
          const rank = Number(line.match(/\bmultipv (\d+)/)?.[1] || 1);
          if (score && rank === 1) {
            setEvaluation(score);
          }

          if (!arrowsRef.current || !line.includes(' pv ')) return;

          const value = parseScoreValue(line);
          const pv = line.split(' pv ')[1] || '';
          const move = pv.split(/\s+/)[0] || '';
          if (value == null || move.length < 4 || rank < 1 || rank > 3) return;

          byRankRef.current.set(rank, { rank, move, value });
        };

        worker.onerror = (event) => {
          console.warn('[Stockfish] Analysis worker failed:', event?.message || event);
          stopWorker();
        };

        worker.postMessage('setoption name Threads value 1');
        worker.postMessage('setoption name Hash value 16');
        worker.postMessage(`setoption name MultiPV value ${arrowsRef.current ? 3 : 1}`);
        worker.postMessage('isready');
      })
      .catch((error) => {
        if (cancelled) return;
        startingRef.current = false;
        setLoading(false);
        loadingRef.current = false;
        if (error instanceof StockfishBusyError) {
          setUnavailableReason('Analysis is running in another tab');
          retryTimer = window.setTimeout(() => {
            if (!cancelled) setWakeKey((key) => key + 1);
          }, BUSY_RETRY_MS);
        } else {
          setUnavailableReason('Analysis engine unavailable');
        }
        console.warn(error.message);
      });

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [shouldRun, stopWorker, wakeKey]);

  useEffect(() => {
    if (!shouldRun || !readyRef.current || !workerRef.current || document.hidden) return;
    startAnalysis();
  }, [arrows, depth, fen, readyKey, shouldRun, startAnalysis]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopWorker();
        return;
      }

      if (enabled && fen) {
        setWakeKey((key) => key + 1);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, fen, stopWorker]);

  useEffect(() => () => stopWorker(false), [stopWorker]);

  return useMemo(() => {
    if (!enabled || !arrows || lines.length === 0) {
      return {
        shapes: EMPTY_SHAPES,
        brushes: EMPTY_BRUSHES,
        lines: EMPTY_LINES,
        evaluation,
        loading,
        unavailableReason,
      };
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

    return { shapes, brushes, lines: weightedLines, evaluation, loading, unavailableReason };
  }, [arrows, enabled, evaluation, lines, loading, unavailableReason]);
}
