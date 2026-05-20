import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import Chessground from '@react-chess/chessground';
import { Activity, ArrowLeft, ChevronLeft, ChevronRight, Clock3, Flag, Radio, RotateCcw, WifiOff } from 'lucide-react';

import Header from '../components/Header';
import ResultCelebration from '../components/ResultCelebration';

import { useAuthRedirect } from '../hooks/useAuthRedirect';
import { useGameNavigationBlocker } from '../hooks/useGameNavigationBlocker';
import { useMultiplayerGame } from '../hooks/useMultiplayerGame';
import { useMoveNavigation } from '../hooks/useMoveNavigation';
import { useUpdateConfig } from '../hooks/useUpdateConfig';
import { useEngineArrows } from '../hooks/useEngineArrows';

import { groupedMoves } from '../utils/chessUtils';
import socket from '../socket';
import { getViewportBoardSize } from '../utils/boardSizing';
import { getResultTone } from '../utils/resultTone';

import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

const DEFAULT_CLOCKS = {
  white: 10 * 60 * 1000,
  black: 10 * 60 * 1000,
};

function formatClock(milliseconds = 0) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const ChessBoard = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();

  const chessRef = useRef(new Chess());
  const [config, setConfig] = useState({});
  const [gameStatus, setGameStatus] = useState('');
  const [playerSide, setPlayerSide] = useState(null);
  const [opponentName, setOpponentName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);
  const [moveHistory, setMoveHistory] = useState([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(null);
  const [boardSize, setBoardSize] = useState(520);
  const [clocks, setClocks] = useState(DEFAULT_CLOCKS);
  const [opponentConnection, setOpponentConnection] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [pendingBlocker, setPendingBlocker] = useState(null);
  const [resultAnalysisEnabled, setResultAnalysisEnabled] = useState(false);
  const gameFinished = Boolean(gameResult || gameStatus);
  const gameStartedRef = useRef(false);
  const gameFinishedRef = useRef(false);
  const resigningRef = useRef(false);
  const closeAfterResultRef = useRef(false);
  const analysisEnabled = resultAnalysisEnabled && gameFinished;
  const {
    shapes: analysisShapes,
    brushes: analysisBrushes,
  } = useEngineArrows({
    fen: analysisEnabled ? chessRef.current.fen() : '',
    enabled: analysisEnabled,
  });

  // AUTH REDIRECT
  useAuthRedirect(navigate, setIsLoading);

  useEffect(() => {
    document.body.classList.add('board-viewport-lock');
    return () => document.body.classList.remove('board-viewport-lock');
  }, []);

  // UPDATE CONFIG HOOK
  const updateConfig = useUpdateConfig({
    chessRef,
    playerSide,
    gameStarted,
    setConfig,
    setMoveHistory,
    setCurrentMoveIndex,
    setGameStatus,
    gameId,
    gameFinished,
    analysisShapes,
    analysisBrushes
  });

  // MULTIPLAYER SOCKET HOOK
  const { isConnected, connectionStatus, resignGame } = useMultiplayerGame({
    chessRef,
    gameId,
    setMoveHistory,
    setCurrentMoveIndex,
    updateConfig,
    setPlayerSide,
    setOpponentName,
    setGameStarted,
    setGameStatus,
    setClocks,
    setOpponentConnection,
    setGameResult,
    navigate
  });

  // NAVIGATION HOOK
  const { goBack, goForward, goLive } = useMoveNavigation({
    chessRef,
    moveHistory,
    currentMoveIndex,
    setCurrentMoveIndex,
    updateConfig
  });

  // Update config after playerSide/gameStarted changes
  useEffect(() => {
    if (playerSide && gameStarted) updateConfig();
  }, [playerSide, gameStarted, gameFinished, updateConfig]);

  useEffect(() => {
    gameStartedRef.current = gameStarted;
    gameFinishedRef.current = gameFinished;
  }, [gameStarted, gameFinished]);

  useEffect(() => {
    if (!gameResult) {
      setResultAnalysisEnabled(false);
    }
  }, [gameResult]);

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!gameStartedRef.current || gameFinishedRef.current || resigningRef.current) return;
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
      title: 'Leave Game?',
      description: 'Leaving now will resign this live game after confirmation.',
      confirmLabel: 'Resign and Leave',
      cancelLabel: 'Stay',
    });
  }, []);

  useGameNavigationBlocker(gameStarted && !gameFinished, handleBlockedNavigation);

  useEffect(() => {
    return () => {
      if (gameStartedRef.current && !gameFinishedRef.current && !resigningRef.current) {
        socket.emit('leave-game-screen', { gameId });
      }
    };
  }, [gameId]);

  // Handle responsive board sizing
  useEffect(() => {
    const handleResize = () => {
      setBoardSize(getViewportBoardSize({
        max: 540,
        min: window.innerWidth <= 560 ? 276 : 320,
        reservedWidth: window.innerWidth > 900 ? 390 : 0,
        reservedHeight: window.innerWidth > 900 ? 305 : 360,
      }));
    };

    handleResize(); // Set initial size
    window.addEventListener('resize', handleResize);
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (gameStarted || gameFinished) updateConfig();
  }, [analysisShapes, gameFinished, gameStarted, updateConfig]);

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-text">
          Loading...
        </div>
      </div>
    );
  }

  const currentTurn = chessRef.current.turn() === 'w' ? 'white' : 'black';
  const bottomSide = playerSide || 'white';
  const topSide = bottomSide === 'white' ? 'black' : 'white';
  const opponentDisconnected = opponentConnection && !gameFinished;
  const resultTone = getResultTone(gameStatus, playerSide, gameResult);
  const abandonmentSeconds = opponentDisconnected
    ? Math.max(0, Math.ceil((opponentConnection.abandonmentDeadline - Date.now()) / 1000))
    : 0;

  const getClockLabel = (side) => {
    if (side === playerSide) return 'You';
    return opponentName || (side === 'white' ? 'White' : 'Black');
  };

  const openResignPrompt = () => {
    if (!gameStarted || gameFinished) return;

    setConfirmAction({
      type: 'resign',
      title: 'Resign Game?',
      description: 'This ends the current live game as a resignation.',
      confirmLabel: 'Resign',
      cancelLabel: 'Stay',
    });
  };

  const cancelConfirmAction = () => {
    if (pendingBlocker?.state === 'blocked') {
      pendingBlocker.reset();
    }
    setPendingBlocker(null);
    setConfirmAction(null);
  };

  const confirmResignation = () => {
    resigningRef.current = true;
    closeAfterResultRef.current = true;
    setResultAnalysisEnabled(false);
    resignGame();
    setConfirmAction(null);
  };

  const startResultAnalysis = () => {
    if (!gameFinished) return;
    closeAfterResultRef.current = false;
    setResultAnalysisEnabled(true);
  };

  const renderClock = (side) => (
    <div className={`player-clock ${currentTurn === side && !gameFinished ? 'active' : ''}`}>
      <div>
        <span>{getClockLabel(side)}</span>
        <strong>{side}</strong>
      </div>
      <time>
        <Clock3 size={17} />
        {formatClock(clocks[side])}
      </time>
    </div>
  );

  return (
    <div className="chess-board-container">
      <Header />
      <ResultCelebration
        key={gameStatus}
        tone={resultTone}
        message={gameStatus}
        onAnalyze={gameFinished ? startResultAnalysis : undefined}
      />

      <div className="game-topbar">
        <button
          onClick={() => navigate('/')}
          className="back-button"
          type="button"
        >
          <ArrowLeft size={16} />
          Lobby
        </button>

        <div className="game-state-strip">
          <span>
            <Radio size={14} />
            {isConnected ? 'Connected' : connectionStatus === 'offline' ? 'Offline' : 'Reconnecting'}
          </span>
          <span>{playerSide ? `You play ${playerSide}` : 'Waiting'}</span>
          {opponentName && <span>vs {opponentName}</span>}
          <span>{currentTurn} to move</span>
        </div>
      </div>

      {!isConnected && gameStarted && !gameFinished && (
        <div className="disconnect-banner own-disconnect-banner">
          <WifiOff size={17} />
          <span>
            {connectionStatus === 'offline'
              ? 'Network offline. The game will rejoin when the connection returns.'
              : 'Reconnecting to the game. Moves resume automatically.'}
          </span>
        </div>
      )}
      {opponentDisconnected && (
        <div className="disconnect-banner">
          <WifiOff size={17} />
          <span>Opponent disconnected. Abandonment in {abandonmentSeconds}s.</span>
        </div>
      )}

      <div className="chess-board-layout">
        <div className="chess-board-center">
          <div className="board-stack">
            {renderClock(topSide)}
            <div
              className={`board-frame game-board-frame ${resultTone ? `result-board-${resultTone}` : ''}`}
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
            {renderClock(bottomSide)}
          </div>
        </div>

        <div className="chess-board-right">
          <div className="game-control-panel">
            <div>
              <span>Live game</span>
              <strong>{gameFinished ? 'Finished' : gameStarted ? 'In progress' : 'Waiting'}</strong>
            </div>
            {gameFinished ? (
              <div className="finished-game-actions">
                <button
                  type="button"
                  className="analysis-mode-button"
                  onClick={startResultAnalysis}
                >
                  <Activity size={16} />
                  Analyze
                </button>
                <button
                  type="button"
                  className="inline-status-button"
                  onClick={() => navigate('/')}
                >
                  <ArrowLeft size={16} />
                  Close
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="resign-button"
                onClick={openResignPrompt}
                disabled={!gameStarted}
              >
                <Flag size={16} />
                Resign
              </button>
            )}
          </div>

          <div className="move-history">
            <h4 className="move-history-title">Move History</h4>
            <table className="move-history-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{playerSide === 'white' ? 'You' : opponentName || 'White'}</th>
                  <th>{playerSide === 'black' ? 'You' : opponentName || 'Black'}</th>
                </tr>
              </thead>
              <tbody>
                {groupedMoves(moveHistory).map((row, idx) => (
                  <tr key={idx}>
                    <td>{row.moveNo}</td>
                    <td
                      className={`move-history-cell ${currentMoveIndex === idx * 2 ? 'active' : ''}`}
                      onClick={() => {
                        chessRef.current.load(moveHistory[idx * 2]?.fen);
                        setCurrentMoveIndex(idx * 2);
                        const moveObj = moveHistory[idx * 2]?.move;
                        updateConfig(moveObj ? [moveObj.from, moveObj.to] : []);
                      }}
                    >
                      {row.whiteMove}
                    </td>
                    <td
                      className={`move-history-cell ${currentMoveIndex === idx * 2 + 1 ? 'active' : ''}`}
                      onClick={() => {
                        chessRef.current.load(moveHistory[idx * 2 + 1]?.fen);
                        setCurrentMoveIndex(idx * 2 + 1);
                        const moveObj = moveHistory[idx * 2 + 1]?.move;
                        updateConfig(moveObj ? [moveObj.from, moveObj.to] : []);
                      }}
                    >
                      {row.blackMove}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {moveHistory.length === 0 && <p>No moves yet</p>}
          </div>

          <div className="move-history-controls">
            <button onClick={goBack} disabled={currentMoveIndex == null || currentMoveIndex <= 0}>
              <ChevronLeft size={15} />
              Prev
            </button>
            <button onClick={goForward} disabled={currentMoveIndex == null || currentMoveIndex >= moveHistory.length - 1}>
              Next
              <ChevronRight size={15} />
            </button>
            <button onClick={goLive} disabled={currentMoveIndex == null}>
              <RotateCcw size={15} />
              Live
            </button>
          </div>
        </div>
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
                onClick={confirmResignation}
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
  );
  
};

export default ChessBoard;
