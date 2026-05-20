import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, RefreshCw, Target, X } from 'lucide-react';
import Header from '../components/Header';
import PuzzleCard from '../components/puzzles/PuzzleCard';
import PuzzleModal from '../components/puzzles/PuzzleModal';
import {
  fetchPuzzles,
  fetchSimilarPuzzles,
  prefetchSimilarPuzzles,
} from '../api/puzzles';

const PLAYED_PUZZLES_KEY = 'e4square-played-puzzles-v1';
const PUZZLE_SET_SIZE = 24;
const PUZZLE_FETCH_SIZE = 50;
const MAX_STORED_PLAYED_IDS = 8000;

const normalizePuzzle = (puzzle) => ({
  ...puzzle,
  id: puzzle.id || puzzle.puzzle_id,
  moves: Array.isArray(puzzle.moves) ? puzzle.moves : [],
  themes: Array.isArray(puzzle.themes) ? puzzle.themes : [],
});

const puzzleKey = (id) => String(id || '');

function readPlayedPuzzleIds() {
  try {
    const stored = JSON.parse(localStorage.getItem(PLAYED_PUZZLES_KEY) || '[]');
    return new Set(Array.isArray(stored) ? stored.map(puzzleKey).filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function writePlayedPuzzleIds(ids) {
  try {
    const compactIds = Array.from(ids).slice(-MAX_STORED_PLAYED_IDS);
    localStorage.setItem(PLAYED_PUZZLES_KEY, JSON.stringify(compactIds));
  } catch {
    // Local storage can fail in private browsing; the trainer still works for this session.
  }
}

const Puzzles = () => {
  const [puzzles, setPuzzles] = useState([]);
  const [selectedPuzzle, setSelectedPuzzle] = useState(null);
  const [similarPuzzles, setSimilarPuzzles] = useState([]);
  const [similarIndex, setSimilarIndex] = useState(0);
  const [maxRating, setMaxRating] = useState(2100);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playedPuzzleIds, setPlayedPuzzleIds] = useState(() => readPlayedPuzzleIds());
  const [sessionStats, setSessionStats] = useState({
    solved: 0,
    perfect: 0,
    failed: 0,
    skipped: 0,
    outcomes: [],
  });
  const playedPuzzleIdsRef = useRef(playedPuzzleIds);
  const failedSessionIdsRef = useRef(new Set());
  const solvedSessionIdsRef = useRef(new Set());

  const markPuzzlePlayed = useCallback((id) => {
    const key = puzzleKey(id);
    if (!key || playedPuzzleIdsRef.current.has(key)) return;

    const nextIds = new Set(playedPuzzleIdsRef.current);
    nextIds.add(key);
    playedPuzzleIdsRef.current = nextIds;
    setPlayedPuzzleIds(nextIds);
    writePlayedPuzzleIds(nextIds);
  }, []);

  const loadPuzzles = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const collected = [];
      const seenIds = new Set();

      for (let attempt = 0; attempt < 4 && collected.length < PUZZLE_SET_SIZE; attempt += 1) {
        const payload = await fetchPuzzles(PUZZLE_FETCH_SIZE, maxRating);
        const candidates = (payload.puzzles || []).map(normalizePuzzle);

        for (const candidate of candidates) {
          const id = puzzleKey(candidate.id);
          if (!id || seenIds.has(id) || playedPuzzleIdsRef.current.has(id)) continue;
          seenIds.add(id);
          collected.push(candidate);
          if (collected.length >= PUZZLE_SET_SIZE) break;
        }
      }

      setPuzzles(collected);
      if (collected.length === 0 && playedPuzzleIdsRef.current.size > 0) {
        setError('No new puzzles found in this draw. Reset played history or try another rating cap.');
      }
    } catch (err) {
      setError(err.message);
      setPuzzles([]);
    } finally {
      setLoading(false);
    }
  }, [maxRating]);

  useEffect(() => {
    loadPuzzles();
  }, [loadPuzzles]);

  const clearPlayedHistory = useCallback(() => {
    const emptySet = new Set();
    playedPuzzleIdsRef.current = emptySet;
    setPlayedPuzzleIds(emptySet);
    writePlayedPuzzleIds(emptySet);
    loadPuzzles();
  }, [loadPuzzles]);

  const recordPuzzleMiss = useCallback((id) => {
    const key = puzzleKey(id);
    if (!key || failedSessionIdsRef.current.has(key) || solvedSessionIdsRef.current.has(key)) return;

    failedSessionIdsRef.current.add(key);
    setSessionStats((current) => ({
      ...current,
      failed: current.failed + 1,
      outcomes: [...current.outcomes.slice(-17), { id: key, status: 'wrong' }],
    }));
  }, []);

  const recordPuzzleSolved = useCallback((id, { perfect } = {}) => {
    const key = puzzleKey(id);
    if (!key || solvedSessionIdsRef.current.has(key)) return;

    solvedSessionIdsRef.current.add(key);

    const solvedPerfectly = Boolean(perfect) && !failedSessionIdsRef.current.has(key);
    if (solvedPerfectly) {
      markPuzzlePlayed(key);
    }

    setSessionStats((current) => {
      return {
        ...current,
        solved: current.solved + 1,
        perfect: solvedPerfectly ? current.perfect + 1 : current.perfect,
        outcomes: solvedPerfectly
          ? [...current.outcomes.slice(-17), { id: key, status: 'right' }]
          : current.outcomes,
      };
    });
  }, [markPuzzlePlayed]);

  const recordPuzzleSkipped = useCallback((id) => {
    const key = puzzleKey(id);
    if (!key || solvedSessionIdsRef.current.has(key)) return;

    if (failedSessionIdsRef.current.has(key)) {
      setSessionStats((current) => ({
        ...current,
        skipped: current.skipped + 1,
      }));
      return;
    }

    failedSessionIdsRef.current.add(key);
    setSessionStats((current) => ({
      ...current,
      failed: current.failed + 1,
      skipped: current.skipped + 1,
      outcomes: [...current.outcomes.slice(-17), { id: key, status: 'wrong' }],
    }));
  }, []);

  const openPuzzle = async (puzzle) => {
    const normalized = normalizePuzzle(puzzle);
    if (playedPuzzleIdsRef.current.has(puzzleKey(normalized.id))) return;

    setSelectedPuzzle(normalized);
    setSimilarPuzzles([]);
    setSimilarIndex(0);

    try {
      const payload = await fetchSimilarPuzzles(normalized.id, 15, 3000);
      setSimilarPuzzles(
        (payload.results || [])
          .map(normalizePuzzle)
          .filter((candidate) => {
            const id = puzzleKey(candidate.id);
            return id && id !== puzzleKey(normalized.id) && !playedPuzzleIdsRef.current.has(id);
          })
      );
      prefetchSimilarPuzzles(normalized.id);
    } catch (err) {
      setError(err.message);
    }
  };

  const goToNextPuzzle = ({ skipped = false } = {}) => {
    if (selectedPuzzle) {
      if (skipped) {
        recordPuzzleSkipped(selectedPuzzle.id);
      }
    }

    for (let index = similarIndex; index < similarPuzzles.length; index += 1) {
      const nextPuzzle = similarPuzzles[index];
      if (playedPuzzleIdsRef.current.has(puzzleKey(nextPuzzle.id))) continue;
      setSimilarIndex(index + 1);
      setSelectedPuzzle(nextPuzzle);
      return;
    }

    setSelectedPuzzle(null);
    loadPuzzles();
  };

  return (
    <div className="puzzles-page">
      <Header />

      <main className="puzzles-content">
        <div className="puzzles-toolbar">
          <div>
            <div className="eyebrow">
              <Target size={15} />
              Tactical training
            </div>
            <h1>Puzzle Trainer</h1>
            <p>{puzzles.length} new positions in this set</p>
          </div>

          <div className="puzzle-toolbar-actions">
            <div className="played-count-pill">
              <strong>{playedPuzzleIds.size}</strong>
              played
            </div>
            <div className="puzzle-result-trail" aria-label="Puzzle result trail">
              {sessionStats.outcomes.length === 0 ? (
                <span className="trail-empty">No attempts yet</span>
              ) : (
                sessionStats.outcomes.map((outcome, index) => (
                  <span
                    key={`${outcome.id}-${index}`}
                    className={`trail-dot ${outcome.status}`}
                    title={outcome.status === 'right' ? 'Solved cleanly' : 'Missed'}
                  >
                    {outcome.status === 'right' ? <Check size={13} /> : <X size={13} />}
                  </span>
                ))
              )}
            </div>
            <label className="puzzle-rating-filter">
              Rating cap
              <select
                value={maxRating}
                onChange={(event) => setMaxRating(Number(event.target.value))}
              >
                <option value={1200}>1200</option>
                <option value={1600}>1600</option>
                <option value={2100}>2100</option>
                <option value={2500}>2500</option>
                <option value={3000}>3000</option>
              </select>
            </label>
            <button
              type="button"
              className={`refresh-button ${loading ? 'is-spinning' : ''}`}
              onClick={loadPuzzles}
              disabled={loading}
            >
              <RefreshCw size={16} />
              New Set
            </button>
            <button type="button" className="secondary-action reset-history-button" onClick={clearPlayedHistory}>
              Reset Played
            </button>
          </div>
        </div>

        {error && <div className="puzzle-error">{error}</div>}
        {loading && <div className="puzzle-loading">Loading puzzles...</div>}

        {!loading && (
          <div className="puzzles-grid">
            {puzzles.map((puzzle) => (
              <PuzzleCard key={puzzle.id} puzzle={puzzle} onOpen={openPuzzle} />
            ))}
          </div>
        )}
      </main>

      <PuzzleModal
        puzzle={selectedPuzzle}
        sessionStats={sessionStats}
        onClose={() => setSelectedPuzzle(null)}
        onNext={goToNextPuzzle}
        onPuzzleMiss={recordPuzzleMiss}
        onPuzzleSolved={recordPuzzleSolved}
      />
    </div>
  );
};

export default Puzzles;
