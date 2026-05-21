import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Chessground from '@react-chess/chessground';
import { Check, Compass, Eye, Lightbulb, RotateCcw, Undo2, X } from 'lucide-react';
import EvaluationBar from '../EvaluationBar';
import EvalToggle from '../EvalToggle';
import AnalysisDepthControl from '../AnalysisDepthControl';
import EngineLinesOverlay from '../EngineLinesOverlay';
import { useAnalysisDepth } from '../../hooks/useAnalysisDepth';
import { getDests } from '../../utils/chessUtils';
import { getViewportBoardSize } from '../../utils/boardSizing';
import {
  getPuzzleMoveLabel,
  getPuzzleMotif,
  getPuzzleRatingLabel,
  getPuzzleTurnLabel,
} from '../../utils/puzzleLabels';
import { useEngineArrows } from '../../hooks/useEngineArrows';

function uciParts(uci) {
  return {
    from: uci?.slice(0, 2),
    to: uci?.slice(2, 4),
    promotion: uci?.slice(4, 5) || undefined,
  };
}

const PuzzleModal = ({
  puzzle,
  sessionStats,
  onClose,
  onNext,
  onPuzzleMiss,
  onPuzzleSolved,
}) => {
  const chessRef = useRef(null);
  const moveIndexRef = useRef(0);
  const handleMoveRef = useRef(() => {});
  const puzzleMissedRef = useRef(false);
  const puzzleSolvedRef = useRef(false);
  const displayedFenRef = useRef(null);
  const [moveIndex, setMoveIndex] = useState(0);
  const [feedback, setFeedback] = useState({ type: 'idle', text: 'Find the best move.' });
  const [config, setConfig] = useState({});
  const [boardSize, setBoardSize] = useState(520);
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState('');
  const [wrongAttempt, setWrongAttempt] = useState(null);
  const [evalEnabled, setEvalEnabled] = useState(false);
  const [positionPly, setPositionPly] = useState(0);
  const [analysisDepth, setAnalysisDepth] = useAnalysisDepth();

  const updateBoard = useCallback(({ lastMove = [], wrongMove = [], displayFen = null, locked = false } = {}) => {
    const chess = chessRef.current;
    if (!chess) return;

    const turnColor = chess.turn() === 'w' ? 'white' : 'black';
    const tacticShapes = wrongMove.length === 2
      ? [{ orig: wrongMove[0], dest: wrongMove[1], brush: 'red' }]
      : [];
    const boardFen = displayFen || chess.fen();
    displayedFenRef.current = boardFen;

    setConfig({
      fen: boardFen,
      orientation: puzzle?.fen?.split(' ')[1] === 'b' ? 'black' : 'white',
      turnColor,
      lastMove,
      coordinates: true,
      movable: {
        free: false,
        color: locked ? null : turnColor,
        dests: locked ? new Map() : getDests(chess),
        showDests: true,
        events: {
          after: (from, to) => {
            handleMoveRef.current(from, to);
          },
        },
      },
      draggable: {
        enabled: true,
        deleteOnDropOff: false,
      },
      highlight: {
        lastMove: true,
        check: true,
      },
      drawable: {
        enabled: false,
        visible: true,
        autoShapes: tacticShapes,
        brushes: {
          red: {
            key: 'red',
            color: '#e05a47',
            opacity: 0.9,
            lineWidth: 10,
          },
        },
      },
      check: chess.inCheck() ? turnColor : false,
      animation: {
        enabled: true,
        duration: 150,
      },
    });
  }, [puzzle]);

  const puzzleMoveCount = puzzle?.moves?.length || 0;
  const puzzleSolved = Boolean(puzzle && puzzleMoveCount > 0 && moveIndex >= puzzleMoveCount);
  const puzzleEvalEnabled = evalEnabled && puzzleSolved;
  const analysisFen = puzzleEvalEnabled
    ? displayedFenRef.current || chessRef.current?.fen() || puzzle?.fen || ''
    : '';
  const {
    lines: analysisLines,
    evaluation,
    loading: evalLoading,
    unavailableReason: analysisUnavailableReason,
  } = useEngineArrows({
    fen: analysisFen,
    enabled: puzzleEvalEnabled,
    depth: analysisDepth,
  });

  const registerPuzzleMiss = useCallback((reason) => {
    if (!puzzle?.id || puzzleMissedRef.current || puzzleSolvedRef.current) return;
    puzzleMissedRef.current = true;
    onPuzzleMiss?.(puzzle.id, { reason });
  }, [onPuzzleMiss, puzzle]);

  const registerPuzzleSolved = useCallback(() => {
    if (!puzzle?.id || puzzleSolvedRef.current) return;
    puzzleSolvedRef.current = true;
    onPuzzleSolved?.(puzzle.id, { perfect: !puzzleMissedRef.current });
  }, [onPuzzleSolved, puzzle]);

  const handleMove = useCallback((from, to) => {
    const chess = chessRef.current;
    const expected = puzzle?.moves?.[moveIndexRef.current];
    if (!chess || wrongAttempt) return;

    setHint('');

    if (puzzleSolvedRef.current) {
      try {
        const piece = chess.get(from);
        if (!piece) {
          updateBoard();
          return;
        }

        const promotion = piece.type === 'p' &&
          ((piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1'))
          ? 'q'
          : undefined;
        const analysisMove = chess.move({ from, to, promotion });
        if (analysisMove) {
          const solvedMoveCount = puzzle?.moves?.length || moveIndexRef.current;
          moveIndexRef.current = solvedMoveCount;
          setMoveIndex(solvedMoveCount);
          setPositionPly(chess.history().length);
          setFeedback({ type: 'idle', text: 'Analysis mode. Eval follows the current board.' });
          updateBoard({ lastMove: [analysisMove.from, analysisMove.to] });
        } else {
          updateBoard();
        }
      } catch (err) {
        console.warn('Illegal analysis move:', err);
        updateBoard();
      }
      return;
    }

    if (!expected) return;

    const expectedMove = uciParts(expected);
    const isExpectedMove = from === expectedMove.from && to === expectedMove.to;
    const move = chess.move({
      from,
      to,
      promotion: expectedMove.promotion || 'q',
    });

    if (!move) {
      setFeedback({ type: 'error', text: 'Illegal move.' });
      setPositionPly(chess.history().length);
      updateBoard();
      return;
    }

    if (!isExpectedMove) {
      const attemptedFen = chess.fen();
      chess.undo();
      registerPuzzleMiss('wrong-move');
      setWrongAttempt({ fen: attemptedFen, move: [from, to] });
      setMistakes((count) => count + 1);
      setFeedback({ type: 'error', text: 'That move misses the tactic.' });
      setPositionPly(chess.history().length);
      updateBoard({ wrongMove: [from, to], displayFen: attemptedFen, locked: true });
      return;
    }

    let nextIndex = moveIndexRef.current + 1;
    let lastMove = [from, to];

    if (puzzle.moves[nextIndex]) {
      const reply = uciParts(puzzle.moves[nextIndex]);
      const replyMove = chess.move({
        from: reply.from,
        to: reply.to,
        promotion: reply.promotion || 'q',
      });
      if (replyMove) {
        lastMove = [replyMove.from, replyMove.to];
      }
      nextIndex += 1;
    }

    moveIndexRef.current = nextIndex;
    setMoveIndex(nextIndex);
    setPositionPly(chess.history().length);

    if (nextIndex >= puzzle.moves.length) {
      setFeedback({ type: 'success', text: 'Solved. Analysis mode is open.' });
      registerPuzzleSolved();
    } else {
      setFeedback({ type: 'success', text: 'Good move. Keep going.' });
    }

    updateBoard({ lastMove });
  }, [puzzle, registerPuzzleMiss, registerPuzzleSolved, updateBoard, wrongAttempt]);

  const retryWrongMove = useCallback(() => {
    setWrongAttempt(null);
    setHint('');
    setFeedback({ type: 'idle', text: 'Try another forcing move.' });
    setPositionPly(chessRef.current?.history().length || 0);
    updateBoard();
  }, [updateBoard]);

  const enterAnalysisMode = () => {
    if (!puzzleSolvedRef.current) return;

    setWrongAttempt(null);
    setHint('');
    setFeedback({ type: 'idle', text: 'Analysis mode. Try any legal move.' });
    setPositionPly(chessRef.current?.history().length || 0);
    updateBoard();
  };

  const moveBack = () => {
    const chess = chessRef.current;
    if (wrongAttempt) {
      retryWrongMove();
      return;
    }

    if (!chess || !puzzleSolvedRef.current || chess.history().length === 0) return;

    const undoneMove = chess.undo();
    if (!undoneMove) return;

    setHint('');
    setFeedback({ type: 'idle', text: 'Analysis mode. Try another line.' });
    setPositionPly(chess.history().length);
    updateBoard();
  };

  const showHint = () => {
    const expected = puzzle?.moves?.[moveIndexRef.current];
    if (!expected) return;
    const { from } = uciParts(expected);
    setHint(`Look at ${from}.`);
  };

  const showMove = () => {
    const expected = puzzle?.moves?.[moveIndexRef.current];
    if (!expected) return;
    const { from, to } = uciParts(expected);
    const alreadyMissed = puzzleMissedRef.current;
    registerPuzzleMiss('show-move');
    if (!alreadyMissed) {
      setMistakes((count) => count + 1);
    }
    setHint(`${from}-${to}`);
    updateBoard({ wrongMove: [from, to] });
  };

  const resetPuzzle = () => {
    if (!puzzle) return;
    chessRef.current = new Chess(puzzle.fen);
    moveIndexRef.current = 0;
    puzzleMissedRef.current = false;
    puzzleSolvedRef.current = false;
    setMoveIndex(0);
    setMistakes(0);
    setWrongAttempt(null);
    setPositionPly(0);
    setHint('');
    setFeedback({ type: 'idle', text: 'Find the best move.' });
    updateBoard();
  };

  useEffect(() => {
    handleMoveRef.current = handleMove;
  }, [handleMove]);

  useEffect(() => {
    if (!puzzle) return undefined;

    document.body.classList.add('board-viewport-lock');
    return () => document.body.classList.remove('board-viewport-lock');
  }, [puzzle]);

  useEffect(() => {
    if (!puzzleSolved && evalEnabled) {
      setEvalEnabled(false);
    }
  }, [evalEnabled, puzzleSolved]);

  useEffect(() => {
    if (!puzzle) return;

    chessRef.current = new Chess(puzzle.fen);
    moveIndexRef.current = 0;
    puzzleMissedRef.current = false;
    puzzleSolvedRef.current = false;
    setMoveIndex(0);
    setMistakes(0);
    setWrongAttempt(null);
    setPositionPly(0);
    setHint('');
    setFeedback({ type: 'idle', text: 'Find the best move.' });
    updateBoard();
  }, [puzzle, updateBoard]);

  useEffect(() => {
    const handleResize = () => {
      const isPhone = window.innerWidth <= 560;
      setBoardSize(getViewportBoardSize({
        max: 520,
        min: isPhone ? 240 : 320,
        reservedWidth: window.innerWidth > 900 ? 420 : isPhone ? 48 : 0,
        reservedHeight: window.innerWidth > 900 ? 135 : 390,
      }));
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [evalEnabled]);

  if (!puzzle) return null;

  const solved = puzzleSolved;
  const totalMoves = Math.ceil((puzzle.moves?.length || 0) / 2);
  const solvedMoves = Math.min(Math.ceil(moveIndex / 2), totalMoves);
  const title = getPuzzleMotif(puzzle.themes);
  const evalDisplay = puzzleEvalEnabled
    ? analysisUnavailableReason ? 'paused' : evaluation?.display || (evalLoading ? '...' : '0.0')
    : '';
  const canExplore = solved && !wrongAttempt;
  const canMoveBack = (solved && positionPly > 0) || Boolean(wrongAttempt);
  const boardOrientation = puzzle?.fen?.split(' ')[1] === 'b' ? 'black' : 'white';

  return (
    <div className="puzzle-modal-overlay">
      <div className="puzzle-modal">
        <div className="puzzle-modal-board">
          <div className="board-with-eval puzzle-board-with-eval">
            {puzzleEvalEnabled ? (
              <EvaluationBar
                evaluation={evaluation}
                enabled={evalEnabled}
                loading={evalLoading}
                statusLabel={analysisUnavailableReason ? 'paused' : ''}
              />
            ) : (
              <div className="eval-bar eval-bar-placeholder" aria-hidden="true" />
            )}
            <div className="board-frame puzzle-board-frame" style={{ '--board-size': `${boardSize}px` }}>
              <div className="board-surface">
                <Chessground
                  width={boardSize}
                  height={boardSize}
                  config={config}
                  contained={false}
                />
                <EngineLinesOverlay
                  lines={analysisLines}
                  orientation={boardOrientation}
                  enabled={puzzleEvalEnabled}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="puzzle-modal-panel">
          <div>
            <h2 className="puzzle-modal-title">{title}</h2>
            <div className="puzzle-modal-meta">
              <span className="puzzle-side-to-move">{getPuzzleTurnLabel(puzzle.fen)}</span>
              <span>{getPuzzleRatingLabel(puzzle.rating)}</span>
              <span>{solvedMoves}/{totalMoves} · {getPuzzleMoveLabel(puzzle.moves)}</span>
              <span>{mistakes} mistakes</span>
            </div>
            {sessionStats?.outcomes?.length > 0 && (
              <div className="puzzle-result-trail modal-trail">
                {sessionStats.outcomes.map((outcome, index) => (
                  <span
                    key={`${outcome.id}-${index}`}
                    className={`trail-dot ${outcome.status}`}
                    title={outcome.status === 'right' ? 'Solved cleanly' : 'Missed'}
                  >
                    {outcome.status === 'right' ? <Check size={13} /> : <X size={13} />}
                  </span>
                ))}
              </div>
            )}
            {Array.isArray(puzzle.themes) && puzzle.themes.length > 0 && (
              <div className="puzzle-theme-list">
                {puzzle.themes.map((theme) => (
                  <span key={theme}>{theme}</span>
                ))}
              </div>
            )}
          </div>

          <div className={`puzzle-status ${feedback.type}`}>
            {feedback.type === 'success' ? <Check size={18} /> : feedback.type === 'error' ? <X size={18} /> : <Lightbulb size={18} />}
            <span>{feedback.text}</span>
            {hint && <strong>{hint}</strong>}
            {wrongAttempt && (
              <button type="button" className="inline-status-button" onClick={retryWrongMove}>
                Try Again
              </button>
            )}
          </div>

          <div className="puzzle-progress" aria-hidden="true">
            <span style={{ width: `${totalMoves ? (solvedMoves / totalMoves) * 100 : 0}%` }} />
          </div>

          <div className="puzzle-tool-row">
            <button type="button" onClick={showHint} disabled={solved || Boolean(wrongAttempt)}>
              <Lightbulb size={16} />
              Hint
            </button>
            <button type="button" onClick={showMove} disabled={solved || Boolean(wrongAttempt)}>
              <Eye size={16} />
              Show Move
            </button>
            <button type="button" onClick={resetPuzzle}>
              <RotateCcw size={16} />
              Reset
            </button>
            {solved && (
              <button type="button" className="analysis-mode-button" onClick={enterAnalysisMode}>
                <Compass size={16} />
                Explore Moves
              </button>
            )}
            <button type="button" onClick={moveBack} disabled={!canMoveBack}>
              <Undo2 size={16} />
              Move Back
            </button>
            {wrongAttempt && (
              <button type="button" className="primary-action" onClick={retryWrongMove}>
                Try Again
              </button>
            )}
            {solved && (
              <EvalToggle
                enabled={evalEnabled}
                onChange={setEvalEnabled}
                value={evalDisplay}
                className="puzzle-eval-toggle"
              />
            )}
            {solved && puzzleEvalEnabled && (
              <AnalysisDepthControl
                depth={analysisDepth}
                onChange={setAnalysisDepth}
                className="puzzle-analysis-depth"
              />
            )}
          </div>

          <div className="puzzle-modal-actions">
            <button type="button" onClick={onClose} className="secondary-action">
              Close
            </button>
            <button
              type="button"
              onClick={() => onNext({ skipped: !solved })}
              className="primary-action"
            >
              {canExplore ? 'Next Puzzle' : 'Skip'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PuzzleModal;
