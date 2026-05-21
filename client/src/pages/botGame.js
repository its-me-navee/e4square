import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Chessground from '@react-chess/chessground';
import { useNavigate } from 'react-router-dom';
import { Activity, Bot, Flag, Play, Undo2 } from 'lucide-react';

import Header from '../components/Header';
import EvaluationBar from '../components/EvaluationBar';
import EvalToggle from '../components/EvalToggle';
import AnalysisDepthControl from '../components/AnalysisDepthControl';
import EngineLinesOverlay from '../components/EngineLinesOverlay';
import ResultCelebration from '../components/ResultCelebration';
import { useBotUpdateConfig } from '../hooks/useBotUpdateConfig';
import { useAnalysisDepth } from '../hooks/useAnalysisDepth';
import { useGameNavigationBlocker } from '../hooks/useGameNavigationBlocker';
import { evaluateGameStatus } from '../utils/gameStatus';
import { getViewportBoardSize } from '../utils/boardSizing';
import { createStockfishWorker, StockfishBusyError, terminateStockfishWorker } from '../utils/stockfish';
import { getResultTone } from '../utils/resultTone';
import { useEngineArrows } from '../hooks/useEngineArrows';

import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

const BotGame = () => {
  const navigate = useNavigate();
  const chessRef = useRef(new Chess());
  const engineRef = useRef(null);
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
  const [evalEnabled, setEvalEnabled] = useState(false);
  const [difficulty, setDifficulty] = useState(5);
  const [engineBlocked, setEngineBlocked] = useState(false);
  const [gameStatus, setGameStatus] = useState('');
  const [boardSize, setBoardSize] = useState(520);
  const [gameStarted, setGameStarted] = useState(false);
  const [showBoard, setShowBoard] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [pendingBlocker, setPendingBlocker] = useState(null);
  const [resultAnalysisEnabled, setResultAnalysisEnabled] = useState(false);
  const [engineWakeKey, setEngineWakeKey] = useState(0);
  const [analysisDepth, setAnalysisDepth] = useAnalysisDepth();

  const gameFinished = Boolean(gameStatus);
  const hasActiveBotGame = gameStarted && showBoard && !gameFinished;
  const canTakeBack = showBoard && moveHistory.length > 0;
  const resultTone = getResultTone(gameStatus, playerSide);
  const analysisEnabled = showBoard && evalEnabled;
  const analysisMode = resultAnalysisEnabled && gameFinished;
  const {
    lines: analysisLines,
    evaluation,
    loading: evalLoading,
    unavailableReason: analysisUnavailableReason,
  } = useEngineArrows({
    fen: analysisEnabled ? chessRef.current.fen() : '',
    enabled: analysisEnabled,
    depth: analysisDepth,
  });
  const evalDisplay = evalEnabled
    ? analysisUnavailableReason ? 'paused' : evaluation?.display || (evalLoading ? '...' : '0.0')
    : '';

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
    let retryTimer = null;

    setEngineBlocked(false);

    createStockfishWorker({ scope: 'play' })
      .then(({ worker, path }) => {
        if (cancelled) {
          terminateStockfishWorker(worker);
          return;
        }

        console.log(`[Stockfish] Loaded engine from ${path}`);
        engineRef.current = worker;
        workerRef = worker;

        worker.postMessage('setoption name Threads value 1');
        worker.postMessage('setoption name Hash value 32');
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

            let botMove = null;
            try {
              botMove = chessRef.current.move({
                from: move.slice(0, 2),
                to: move.slice(2, 4),
                promotion: move.slice(4, 5) || 'q',
              });
            } catch (err) {
              console.warn('[Stockfish] Ignored invalid bot move:', move, err);
              return;
            }

            if (!botMove) return;

            setMoveHistory((history) => [...history, { move: botMove, fen: chessRef.current.fen() }]);
            updateConfigRef.current();

            const status = evaluateGameStatus(chessRef.current);
            if (status) setGameStatus(status);
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
        if (err instanceof StockfishBusyError) {
          setEngineBlocked(true);
          retryTimer = window.setTimeout(() => {
            if (!cancelled) setEngineWakeKey((key) => key + 1);
          }, 5500);
          return;
        }
        alert('Could not load chess engine. Please try again later.');
      });

    return () => {
      cancelled = true;
      botSearchActiveRef.current = false;
      pendingBotMoveRef.current = false;
      if (engineRef.current === workerRef) {
        engineRef.current = null;
      }
      if (retryTimer) window.clearTimeout(retryTimer);
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

  const takeBackMove = useCallback(() => {
    const chess = chessRef.current;
    const historyLength = chess.history().length;
    if (historyLength === 0) return;

    botSearchActiveRef.current = false;
    pendingBotMoveRef.current = false;
    engineRef.current?.postMessage('stop');

    if (resultAnalysisEnabled) {
      const undoneMove = chess.undo();
      if (!undoneMove) return;

      setMoveHistory((history) => history.slice(0, -1));
      closeAfterResultRef.current = false;
      window.setTimeout(() => {
        updateConfigRef.current();
      }, 0);
      return;
    }

    const currentTurn = chess.turn() === 'w' ? 'white' : 'black';
    const undoTarget = currentTurn === playerSide ? 2 : 1;
    const undoCount = Math.min(undoTarget, historyLength);

    for (let index = 0; index < undoCount; index += 1) {
      chess.undo();
    }

    setMoveHistory((history) => history.slice(0, Math.max(0, history.length - undoCount)));
    setGameStatus('');
    closeAfterResultRef.current = false;
    window.setTimeout(() => {
      updateConfigRef.current();
    }, 0);
  }, [playerSide, resultAnalysisEnabled]);

  const resignBotGame = useCallback(({ closeAfterResult = false } = {}) => {
    botSearchActiveRef.current = false;
    engineRef.current?.postMessage('stop');
    pendingBotMoveRef.current = false;
    closeAfterResultRef.current = closeAfterResult;
    setResultAnalysisEnabled(false);
    setEvalEnabled(false);
    const winner = playerSide === 'white' ? 'Black' : 'White';
    setGameStatus(`${winner} won by resignation`);
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

  const ignoreCurrentMoveIndex = useCallback(() => {}, []);

  const updateConfig = useBotUpdateConfig({
    chessRef,
    playerSide,
    setConfig,
    setMoveHistory,
    setCurrentMoveIndex: ignoreCurrentMoveIndex,
    setGameStatus,
    onPlayerMove: handlePlayerMove,
    gameFinished,
    analysisMode,
  });

  useEffect(() => {
    updateConfigRef.current = updateConfig;
  }, [updateConfig]);

  useEffect(() => {
    updateConfig();
  }, [playerSide, gameFinished, updateConfig]);

  useEffect(() => {
    if (showBoard) updateConfig();
  }, [analysisMode, showBoard, updateConfig]);

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
      {!resultAnalysisEnabled && (
        <ResultCelebration
          key={gameStatus}
          tone={resultTone}
          message={gameStatus}
          onAnalyze={gameStatus ? startResultAnalysis : undefined}
        />
      )}

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
            {evalEnabled ? (
              <EvaluationBar
                evaluation={evaluation}
                enabled={evalEnabled}
                loading={evalLoading}
                statusLabel={analysisUnavailableReason ? 'paused' : ''}
              />
            ) : (
              <div className="eval-bar eval-bar-placeholder" aria-hidden="true" />
            )}
            <div
              className={`board-frame bot-board-frame ${resultTone && !resultAnalysisEnabled ? `result-board-${resultTone}` : ''}`}
              style={{ '--board-size': `${boardSize}px` }}
            >
              <div className="board-surface">
                <Chessground
                  width={boardSize}
                  height={boardSize}
                  config={config}
                  contained={false}
                />
                <EngineLinesOverlay
                  lines={analysisLines}
                  orientation={playerSide}
                  enabled={analysisEnabled}
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

          {showBoard && evalEnabled && (
            <AnalysisDepthControl
              depth={analysisDepth}
              onChange={setAnalysisDepth}
              className="bot-analysis-depth"
            />
          )}

          {engineBlocked && (
            <span className="engine-guard-status">
              Stockfish is active in another tab
            </span>
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
