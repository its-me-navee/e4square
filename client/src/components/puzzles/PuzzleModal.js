import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Chessground from '@react-chess/chessground';
import { Check, Compass, Eye, Lightbulb, RotateCcw, Undo2, X } from 'lucide-react';
import EvaluationBar from '../EvaluationBar';
import EvalToggle from '../EvalToggle';
import { getDests } from '../../utils/chessUtils';
import { getViewportBoardSize } from '../../utils/boardSizing';
import { createStockfishWorker, parseStockfishScore, terminateStockfishWorker } from '../../utils/stockfish';
import { getPuzzleMoveLabel, getPuzzleMotif, getPuzzleRatingLabel } from '../../utils/puzzleLabels';
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
  const engineRef = useRef(null);
  const evalTurnRef = useRef('w');
  const displayedFenRef = useRef(null);
  const analysisShapesRef = useRef([]);
  const analysisBrushesRef = useRef({});
  const [moveIndex, setMoveIndex] = useState(0);
  const [feedback, setFeedback] = useState({ type: 'idle', text: 'Find the best move.' });
  const [config, setConfig] = useState({});
  const [boardSize, setBoardSize] = useState(520);
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState('');
  const [wrongAttempt, setWrongAttempt] = useState(null);
  const [evalEnabled, setEvalEnabled] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [positionPly, setPositionPly] = useState(0);

  const updateBoard = useCallback(({ lastMove = [], wrongMove = [], displayFen = null, locked = false } = {}) => {
    const chess = chessRef.current;
    if (!chess) return;

    const turnColor = chess.turn() === 'w' ? 'white' : 'black';
    const tacticShapes = wrongMove.length === 2
      ? [{ orig: wrongMove[0], dest: wrongMove[1], brush: 'red' }]
      : [];
    const autoShapes = [
      ...analysisShapesRef.current,
      ...tacticShapes,
    ];
    const boardFen = displayFen || chess.fen();
    const analysisMode = puzzleSolvedRef.current;
    displayedFenRef.current = boardFen;

    setConfig({
      fen: boardFen,
      orientation: puzzle?.fen?.split(' ')[1] === 'b' ? 'black' : 'white',
      turnColor,
      lastMove,
      coordinates: true,
      movable: {
        free: analysisMode,
        color: locked ? null : turnColor,
        dests: locked ? new Map() : analysisMode ? undefined : getDests(chess),
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
        autoShapes,
        brushes: {
          red: {
            key: 'red',
            color: '#e05a47',
            opacity: 0.9,
            lineWidth: 10,
          },
          ...analysisBrushesRef.current,
        },
      },
      check: chess.inCheck() ? turnColor : false,
      animation: {
        enabled: true,
        duration: 150,
      },
    });
  }, [puzzle]);

  const analysisFen = displayedFenRef.current || chessRef.current?.fen() || puzzle?.fen || '';
  const {
    shapes: analysisShapes,
    brushes: analysisBrushes,
  } = useEngineArrows({
    fen: analysisFen,
    enabled: evalEnabled,
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

  const evaluatePosition = useCallback(() => {
    if (!engineRef.current || !evalEnabled || !chessRef.current) return;

    const boardFen = displayedFenRef.current || chessRef.current.fen();
    setEvalLoading(true);
    evalTurnRef.current = boardFen.split(' ')[1] || chessRef.current.turn();
    engineRef.current.postMessage('stop');
    engineRef.current.postMessage(`position fen ${boardFen}`);
    engineRef.current.postMessage('go depth 6');
  }, [evalEnabled]);

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
          if (evalEnabled) {
            window.setTimeout(evaluatePosition, 80);
          }
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
      if (evalEnabled) {
        window.setTimeout(evaluatePosition, 80);
      }
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
    if (evalEnabled) {
      window.setTimeout(evaluatePosition, 80);
    }
  }, [evalEnabled, evaluatePosition, puzzle, registerPuzzleMiss, registerPuzzleSolved, updateBoard, wrongAttempt]);

  const retryWrongMove = useCallback(() => {
    setWrongAttempt(null);
    setHint('');
    setFeedback({ type: 'idle', text: 'Try another forcing move.' });
    setPositionPly(chessRef.current?.history().length || 0);
    updateBoard();
    if (evalEnabled) {
      window.setTimeout(evaluatePosition, 80);
    }
  }, [evalEnabled, evaluatePosition, updateBoard]);

  const enterAnalysisMode = () => {
    if (!puzzleSolvedRef.current) return;

    setWrongAttempt(null);
    setHint('');
    setFeedback({ type: 'idle', text: 'Analysis mode. Try any legal move.' });
    setPositionPly(chessRef.current?.history().length || 0);
    updateBoard();
    if (evalEnabled) {
      window.setTimeout(evaluatePosition, 80);
    }
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
    if (evalEnabled) {
      window.setTimeout(evaluatePosition, 80);
    }
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
    if (evalEnabled) {
      window.setTimeout(evaluatePosition, 80);
    }
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
    setEvaluation(null);
    setEvalLoading(false);
    setPositionPly(0);
    setHint('');
    setFeedback({ type: 'idle', text: 'Find the best move.' });
    updateBoard();
    if (evalEnabled) {
      window.setTimeout(evaluatePosition, 80);
    }
  };

  useEffect(() => {
    handleMoveRef.current = handleMove;
  }, [handleMove]);

  useEffect(() => {
    analysisShapesRef.current = analysisShapes;
    analysisBrushesRef.current = analysisBrushes;

    if (!puzzle || !chessRef.current) return;

    if (wrongAttempt) {
      updateBoard({ wrongMove: wrongAttempt.move, displayFen: wrongAttempt.fen, locked: true });
      return;
    }

    updateBoard();
  }, [analysisBrushes, analysisShapes, puzzle, updateBoard, wrongAttempt]);

  useEffect(() => {
    if (!puzzle) return undefined;

    document.body.classList.add('board-viewport-lock');
    return () => document.body.classList.remove('board-viewport-lock');
  }, [puzzle]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setEvalEnabled(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (!evalEnabled || !puzzle) {
      terminateStockfishWorker(engineRef.current);
      engineRef.current = null;
      setEvaluation(null);
      setEvalLoading(false);
      return undefined;
    }

    let cancelled = false;
    let startTimer = null;
    createStockfishWorker({ liteOnly: true })
      .then(({ worker }) => {
        if (cancelled) {
          terminateStockfishWorker(worker);
          return;
        }

        engineRef.current = worker;
        worker.postMessage('uci');
        worker.postMessage('isready');
        worker.onmessage = (event) => {
          const line = event.data;
          if (line.startsWith('bestmove')) {
            setEvalLoading(false);
            return;
          }

          if (line.includes('score cp') || line.includes('score mate')) {
            const score = parseStockfishScore(line, evalTurnRef.current);
            if (score) setEvaluation(score);
          }
        };

        startTimer = window.setTimeout(evaluatePosition, 150);
      })
      .catch((err) => {
        console.warn(err.message);
        if (!cancelled) {
          setEvalEnabled(false);
          setEvalLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (startTimer) window.clearTimeout(startTimer);
      terminateStockfishWorker(engineRef.current);
      engineRef.current = null;
    };
  }, [evalEnabled, evaluatePosition, puzzle]);

  useEffect(() => {
    if (!puzzle) return;

    chessRef.current = new Chess(puzzle.fen);
    moveIndexRef.current = 0;
    puzzleMissedRef.current = false;
    puzzleSolvedRef.current = false;
    setMoveIndex(0);
    setMistakes(0);
    setWrongAttempt(null);
    setEvaluation(null);
    setEvalLoading(false);
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

  const solved = moveIndex >= (puzzle.moves?.length || 0);
  const totalMoves = Math.ceil((puzzle.moves?.length || 0) / 2);
  const solvedMoves = Math.min(Math.ceil(moveIndex / 2), totalMoves);
  const title = getPuzzleMotif(puzzle.themes);
  const evalDisplay = evalEnabled ? evaluation?.display || (evalLoading ? '...' : '0.0') : '';
  const canExplore = solved && !wrongAttempt;
  const canMoveBack = (solved && positionPly > 0) || Boolean(wrongAttempt);

  return (
    <div className="puzzle-modal-overlay">
      <div className="puzzle-modal">
        <div className="puzzle-modal-board">
          <div className="board-with-eval puzzle-board-with-eval">
            {evalEnabled && (
              <EvaluationBar
                evaluation={evaluation}
                enabled={evalEnabled}
                loading={evalLoading}
              />
            )}
            <div className="board-frame puzzle-board-frame" style={{ '--board-size': `${boardSize}px` }}>
              <div className="board-surface">
                <Chessground
                  width={boardSize}
                  height={boardSize}
                  config={config}
                  contained={false}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="puzzle-modal-panel">
          <div>
            <h2 className="puzzle-modal-title">{title}</h2>
            <div className="puzzle-modal-meta">
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
            <EvalToggle
              enabled={evalEnabled}
              onChange={setEvalEnabled}
              value={evalDisplay}
              className="puzzle-eval-toggle"
            />
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
