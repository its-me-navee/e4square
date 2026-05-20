import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Chessground from '@react-chess/chessground';
import { useNavigate } from 'react-router-dom';
import { Activity, Bot, Flag, Play, Undo2 } from 'lucide-react';

import Header from '../components/Header';
import EvaluationBar from '../components/EvaluationBar';
import EvalToggle from '../components/EvalToggle';
import ResultCelebration from '../components/ResultCelebration';
import { useBotUpdateConfig } from '../hooks/useBotUpdateConfig';
import { useGameNavigationBlocker } from '../hooks/useGameNavigationBlocker';
import { evaluateGameStatus } from '../utils/gameStatus';
import { getViewportBoardSize } from '../utils/boardSizing';
import { createStockfishWorker, parseStockfishScore, terminateStockfishWorker } from '../utils/stockfish';
import { getResultTone } from '../utils/resultTone';
import { useEngineArrows } from '../hooks/useEngineArrows';

import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

const BotGame = () => {
  const navigate = useNavigate();
  const chessRef = useRef(new Chess());
  const engineRef = useRef(null);
  const evalEngineRef = useRef(null);
  const evalTurnRef = useRef('w');
  const evalEnabledRef = useRef(false);
  const evaluatePositionRef = useRef(() => {});
  const updateConfigRef = useRef(() => {});
  const pendingBotMoveRef = useRef(false);
  const botSearchActiveRef = useRef(false);
  const gameFinishedRef = useRef(false);
  const activeBotGameRef = useRef(false);
  const closeAfterResultRef = useRef(false);
  const showBoardRef = useRef(false);
  const playerSideRef = useRef('white');

  const [playerSide, setPlayerSide] = useState('white');
  const [config, setConfig] = useState({});
  const [moveHistory, setMoveHistory] = useState([]);
  const [evaluation, setEvaluation] = useState(null);
  const [evalEnabled, setEvalEnabled] = useState(false);
  const [evalLoading, setEvalLoading] = useState(false);
  const [difficulty, setDifficulty] = useState(5);
  const [gameStatus, setGameStatus] = useState('');
  const [boardSize, setBoardSize] = useState(520);
  const [gameStarted, setGameStarted] = useState(false);
  const [showBoard, setShowBoard] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [pendingBlocker, setPendingBlocker] = useState(null);
  const [resultAnalysisEnabled, setResultAnalysisEnabled] = useState(false);
  const [engineWakeKey, setEngineWakeKey] = useState(0);

  const gameFinished = Boolean(gameStatus);
  const hasActiveBotGame = gameStarted && showBoard && !gameFinished;
  const canTakeBack = showBoard && moveHistory.length > 0;
  const resultTone = getResultTone(gameStatus, playerSide);
  const evalDisplay = evalEnabled ? evaluation?.display || (evalLoading ? '...' : '0.0') : '';
  const analysisEnabled = showBoard && evalEnabled;
  const {
    shapes: analysisShapes,
    brushes: analysisBrushes,
  } = useEngineArrows({
    fen: analysisEnabled ? chessRef.current.fen() : '',
    enabled: analysisEnabled,
  });

  useEffect(() => {
    document.body.classList.add('board-viewport-lock');
    return () => document.body.classList.remove('board-viewport-lock');
  }, []);

  useEffect(() => {
    gameFinishedRef.current = gameFinished;
    activeBotGameRef.current = hasActiveBotGame;
  }, [gameFinished, hasActiveBotGame]);

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!activeBotGameRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const handleBlockedNavigation = useCallback((blocker) => {
    setPendingBlocker(blocker);
    setConfirmAction({
      type: 'leave',
      title: 'Leave Bot Game?',
      description: 'Leaving now will resign the current game against Stockfish.',
      confirmLabel: 'Resign and Leave',
      cancelLabel: 'Stay',
    });
  }, []);

  useGameNavigationBlocker(hasActiveBotGame, handleBlockedNavigation);

  useEffect(() => {
    evalEnabledRef.current = evalEnabled;
  }, [evalEnabled]);

  useEffect(() => {
    showBoardRef.current = showBoard;
  }, [showBoard]);

  useEffect(() => {
    playerSideRef.current = playerSide;
  }, [playerSide]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        botSearchActiveRef.current = false;
        pendingBotMoveRef.current = false;
        terminateStockfishWorker(engineRef.current);
        engineRef.current = null;
        setEvalEnabled(false);
        return;
      }

      if (!showBoardRef.current || gameFinishedRef.current) return;

      const turnSide = chessRef.current.turn() === 'w' ? 'white' : 'black';
      pendingBotMoveRef.current = turnSide !== playerSideRef.current;
      setEngineWakeKey((key) => key + 1);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const sendBotSearch = useCallback((worker) => {
    if (gameFinishedRef.current) return;

    const chess = chessRef.current;
    const status = evaluateGameStatus(chess);
    if (status) {
      setGameStatus(status);
      return;
    }

    botSearchActiveRef.current = true;
    worker.postMessage(`position fen ${chess.fen()}`);
    const searchDepth = Math.max(4, Math.min(10, Math.round(4 + difficulty / 4)));
    worker.postMessage(`go depth ${searchDepth}`);
  }, [difficulty]);

  // Load move engine. Evaluation uses a separate worker so it cannot
  // consume or cancel the bot's actual move search.
  useEffect(() => {
    if (!showBoard || gameFinished) {
      botSearchActiveRef.current = false;
      pendingBotMoveRef.current = false;
      if (engineRef.current) {
        terminateStockfishWorker(engineRef.current);
        engineRef.current = null;
      }
      return undefined;
    }

    let cancelled = false;
    let workerRef = null;

    createStockfishWorker()
      .then(({ worker, path }) => {
        if (cancelled) {
          terminateStockfishWorker(worker);
          return;
        }

        console.log(`[Stockfish] Loaded engine from ${path}`);
        engineRef.current = worker;
        workerRef = worker;

        worker.postMessage('uci');
        worker.postMessage(`setoption name Skill Level value ${difficulty}`);
        worker.postMessage('isready');

        worker.onmessage = (e) => {
          const line = e.data;

          if (line.startsWith('bestmove')) {
            if (!botSearchActiveRef.current) return;
            botSearchActiveRef.current = false;
            if (gameFinishedRef.current) return;

            const move = line.split(' ')[1];
            if (!move || move === '(none)' || move.length < 4) {
              return;
            }

            try {
              chessRef.current.move({
                from: move.slice(0, 2),
                to: move.slice(2, 4),
                promotion: move.slice(4, 5) || 'q',
              });
            } catch (err) {
              console.warn('[Stockfish] Ignored invalid bot move:', move, err);
              return;
            }

            setMoveHistory([...chessRef.current.history()]);
            updateConfigRef.current();

            const status = evaluateGameStatus(chessRef.current);
            if (status) setGameStatus(status);
            if (evalEnabledRef.current) {
              setTimeout(() => evaluatePositionRef.current(), 100);
            }
          }
        };

        if (pendingBotMoveRef.current) {
          pendingBotMoveRef.current = false;
          window.setTimeout(() => sendBotSearch(worker), 100);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err.message);
        alert('Could not load chess engine. Please try again later.');
      });

    return () => {
      cancelled = true;
      botSearchActiveRef.current = false;
      pendingBotMoveRef.current = false;
      if (engineRef.current === workerRef) {
        engineRef.current = null;
      }
      terminateStockfishWorker(workerRef);
    };
  }, [difficulty, engineWakeKey, gameFinished, sendBotSearch, showBoard]);

  const makeBotMove = useCallback(() => {
    if (gameFinishedRef.current) return;

    if (!engineRef.current) {
      pendingBotMoveRef.current = true;
      return;
    }

    sendBotSearch(engineRef.current);
  }, [sendBotSearch]);

  const evaluatePosition = useCallback(() => {
    if (!evalEngineRef.current || !evalEnabled) return;
    const chess = chessRef.current;
    setEvalLoading(true);
    evalTurnRef.current = chess.turn();
    evalEngineRef.current.postMessage('stop');
    evalEngineRef.current.postMessage(`position fen ${chess.fen()}`);
    evalEngineRef.current.postMessage('go depth 6');
  }, [evalEnabled]);

  useEffect(() => {
    evaluatePositionRef.current = evaluatePosition;
  }, [evaluatePosition]);

  useEffect(() => {
    if (!evalEnabled) {
      terminateStockfishWorker(evalEngineRef.current);
      evalEngineRef.current = null;
      setEvaluation(null);
      setEvalLoading(false);
      return undefined;
    }

    let workerRef = null;
    let cancelled = false;

    createStockfishWorker({ liteOnly: true })
      .then(({ worker }) => {
        if (cancelled) {
          terminateStockfishWorker(worker);
          return;
        }

        workerRef = worker;
        evalEngineRef.current = worker;
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
            if (score && evalEnabledRef.current) {
              setEvaluation(score);
            }
          }
        };

        if (showBoard) {
          window.setTimeout(() => evaluatePositionRef.current(), 120);
        }
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
      terminateStockfishWorker(workerRef);
      if (evalEngineRef.current === workerRef) {
        evalEngineRef.current = null;
      }
    };
  }, [evalEnabled, showBoard]);

  const takeBackMove = useCallback(() => {
    const chess = chessRef.current;
    const historyLength = chess.history().length;
    if (historyLength === 0) return;

    botSearchActiveRef.current = false;
    pendingBotMoveRef.current = false;
    engineRef.current?.postMessage('stop');

    const currentTurn = chess.turn() === 'w' ? 'white' : 'black';
    const undoTarget = currentTurn === playerSide ? 2 : 1;
    const undoCount = Math.min(undoTarget, historyLength);

    for (let index = 0; index < undoCount; index += 1) {
      chess.undo();
    }

    const nextHistory = chess.history();
    setMoveHistory(nextHistory);
    setGameStatus('');
    closeAfterResultRef.current = false;
    setEvaluation(null);
    setEvalLoading(false);
    window.setTimeout(() => {
      updateConfigRef.current();
      if (evalEnabledRef.current) {
        evaluatePositionRef.current();
      }
    }, 0);
  }, [playerSide]);

  const resignBotGame = useCallback(({ closeAfterResult = false } = {}) => {
    botSearchActiveRef.current = false;
    engineRef.current?.postMessage('stop');
    pendingBotMoveRef.current = false;
    closeAfterResultRef.current = closeAfterResult;
    setResultAnalysisEnabled(false);
    setEvalEnabled(false);
    const winner = playerSide === 'white' ? 'Black' : 'White';
    setGameStatus(`${winner} won by resignation`);
    setEvalLoading(false);
    window.setTimeout(() => updateConfigRef.current(), 0);
  }, [playerSide]);

  const requestResign = useCallback(() => {
    if (!hasActiveBotGame) return;

    setConfirmAction({
      type: 'resign',
      title: 'Resign Game?',
      description: 'This ends the current bot game as a resignation.',
      confirmLabel: 'Resign',
      cancelLabel: 'Keep Playing',
    });
  }, [hasActiveBotGame]);

  const cancelConfirmAction = useCallback(() => {
    if (pendingBlocker?.state === 'blocked') {
      pendingBlocker.reset();
    }
    setPendingBlocker(null);
    setConfirmAction(null);
  }, [pendingBlocker]);

  const confirmBotAction = useCallback(() => {
    const actionType = confirmAction?.type;
    setConfirmAction(null);

    if (actionType === 'leave') {
      resignBotGame({ closeAfterResult: true });
      return;
    }

    if (actionType === 'resign') {
      resignBotGame();
    }
  }, [confirmAction, resignBotGame]);

  useEffect(() => {
    if (gameStatus && !resultAnalysisEnabled) {
      setEvalEnabled(false);
    }
  }, [gameStatus, resultAnalysisEnabled]);

  useEffect(() => {
    if (!gameStatus || resultAnalysisEnabled || !closeAfterResultRef.current) return undefined;

    const timer = window.setTimeout(() => {
      closeAfterResultRef.current = false;
      if (pendingBlocker?.state === 'blocked') {
        pendingBlocker.proceed();
        return;
      }

      navigate('/');
    }, 3200);

    return () => window.clearTimeout(timer);
  }, [gameStatus, navigate, pendingBlocker, resultAnalysisEnabled]);

  const startResultAnalysis = useCallback(() => {
    if (!gameStatus) return;
    closeAfterResultRef.current = false;
    setEvalEnabled(true);
    setResultAnalysisEnabled(true);
    window.setTimeout(() => {
      updateConfigRef.current();
      evaluatePositionRef.current();
    }, 80);
  }, [gameStatus]);

  const startGame = () => {
    setShowBoard(true);
    setGameStarted(true);
    updateConfig();
    if (playerSide === 'black') {
      setTimeout(makeBotMove, 500);
    }
  };

  const handlePlayerMove = useCallback(() => {
    setGameStarted(true);
    setTimeout(makeBotMove, 100);
  }, [makeBotMove]);

  const updateConfig = useBotUpdateConfig({
    chessRef,
    playerSide,
    setConfig,
    setMoveHistory,
    setCurrentMoveIndex: () => {}, // Optional: implement if needed
    setGameStatus,
    onPlayerMove: handlePlayerMove,
    gameFinished,
    analysisShapes,
    analysisBrushes,
  });

  useEffect(() => {
    updateConfigRef.current = updateConfig;
  }, [updateConfig]);

  useEffect(() => {
    updateConfig();
  }, [playerSide, gameFinished, updateConfig]);

  useEffect(() => {
    if (showBoard) updateConfig();
  }, [analysisShapes, showBoard, updateConfig]);

  useEffect(() => {
    if (evalEnabled && showBoard) {
      evaluatePosition();
    } else if (!evalEnabled) {
      setEvaluation(null);
      setEvalLoading(false);
    }
  }, [evalEnabled, evaluatePosition, showBoard]);

  // Handle responsive board sizing
  useEffect(() => {
    const handleResize = () => {
      setBoardSize(getViewportBoardSize({
        max: 540,
        min: window.innerWidth <= 560 ? 276 : 320,
        reservedHeight: gameStarted ? 280 : 320,
      }));
    };

    handleResize(); // Set initial size
    window.addEventListener('resize', handleResize);
    
    return () => window.removeEventListener('resize', handleResize);
  }, [gameStarted]);

  return (
    <div className="bot-game-container">
      <Header />
      <ResultCelebration
        key={gameStatus}
        tone={resultTone}
        message={gameStatus}
        onAnalyze={gameStatus ? startResultAnalysis : undefined}
      />

      <div className="bot-game-content">
        <div className="bot-game-heading">
          <div className="eyebrow">
            <Bot size={15} />
            Stockfish
          </div>
        </div>

        {!gameStarted && (
          <>
            <div className="bot-setup-panel">
              <div className="bot-controls">
                <label>Side</label>
                <div className="segmented-control">
                  <button
                    type="button"
                    className={playerSide === 'white' ? 'selected' : ''}
                    onClick={() => setPlayerSide('white')}
                  >
                    White
                  </button>
                  <button
                    type="button"
                    className={playerSide === 'black' ? 'selected' : ''}
                    onClick={() => setPlayerSide('black')}
                  >
                    Black
                  </button>
                </div>
              </div>

              <div className="bot-controls bot-difficulty-control">
                <label>Difficulty</label>
                <div className="bot-slider-row">
                  <input
                    type="range"
                    min="0"
                    max="20"
                    value={difficulty}
                    onChange={e => setDifficulty(+e.target.value)}
                  />
                  <span>{difficulty}</span>
                </div>
              </div>

              <div className="bot-controls bot-eval-control">
                <EvalToggle
                  enabled={evalEnabled}
                  onChange={setEvalEnabled}
                  className="bot-setup-eval-toggle"
                />
              </div>
            </div>

            <button
              onClick={startGame}
              className="start-game-button"
              type="button"
            >
              <Play size={17} />
              Start Game
            </button>
          </>
        )}

        {showBoard && (
          <div className="board-with-eval">
            {evalEnabled && (
              <EvaluationBar
                evaluation={evaluation}
                enabled={evalEnabled}
                loading={evalLoading}
              />
            )}
            <div
              className={`board-frame bot-board-frame ${resultTone ? `result-board-${resultTone}` : ''}`}
              style={{ '--board-size': `${boardSize}px` }}
            >
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
        )}

        <div className="bot-game-buttons">
          {showBoard && (
            <EvalToggle
              enabled={evalEnabled}
              onChange={setEvalEnabled}
              value={evalDisplay}
              className="bot-board-eval-toggle"
            />
          )}

          {showBoard && gameFinished && (
            <button
              type="button"
              className="analysis-mode-button bot-analysis-button"
              onClick={startResultAnalysis}
            >
              <Activity size={16} />
              Analyze
            </button>
          )}

          {showBoard && !gameFinished && (
            <button
              type="button"
              className="resign-button bot-resign-button"
              onClick={requestResign}
              title="Resign the current bot game"
            >
              <Flag size={16} />
              Resign
            </button>
          )}

          {showBoard && (
            <button
              type="button"
              className="takeback-button"
              onClick={takeBackMove}
              disabled={!canTakeBack}
              title="Take back your last move"
            >
              <Undo2 size={16} />
              Take Back
            </button>
          )}
        </div>

        {confirmAction && (
          <div className="modal-overlay">
            <div className="modal-content resign-modal">
              <h2 className="modal-title">{confirmAction.title}</h2>
              <p className="modal-description">
                {confirmAction.description}
              </p>
              <div className="modal-buttons">
                <button
                  type="button"
                  className="decline-button"
                  onClick={confirmBotAction}
                >
                  <Flag size={16} />
                  {confirmAction.confirmLabel}
                </button>
                <button
                  type="button"
                  className="accept-button"
                  onClick={cancelConfirmAction}
                >
                  {confirmAction.cancelLabel}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BotGame;
