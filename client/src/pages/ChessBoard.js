import React, { useRef, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import Chessground from '@react-chess/chessground';

import Header from '../components/Header';

import { useAuthRedirect } from '../hooks/useAuthRedirect';
import { useMultiplayerGame } from '../hooks/useMultiplayerGame';
import { useMoveNavigation } from '../hooks/useMoveNavigation';
import { useUpdateConfig } from '../hooks/useUpdateConfig';

import { groupedMoves } from '../utils/chessUtils';

import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

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

  // AUTH REDIRECT
  useAuthRedirect(navigate, setIsLoading);

  // UPDATE CONFIG HOOK
  const updateConfig = useUpdateConfig({
    chessRef,
    playerSide,
    gameStarted,
    setConfig,
    setMoveHistory,
    setCurrentMoveIndex,
    setGameStatus,
    gameId
  });

  // MULTIPLAYER SOCKET HOOK
  const { isConnected } = useMultiplayerGame({
    chessRef,
    gameId,
    setMoveHistory,
    setCurrentMoveIndex,
    updateConfig,
    setPlayerSide,
    setOpponentName,
    setGameStarted,
    setGameStatus,
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
  }, [playerSide, gameStarted]);

  // Handle responsive board sizing
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 480) {
        setBoardSize(280);
      } else if (window.innerWidth <= 768) {
        setBoardSize(320);
      } else {
        setBoardSize(520);
      }
    };

    handleResize(); // Set initial size
    window.addEventListener('resize', handleResize);
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-text">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="chess-board-container">
      <Header />
    
      <div className="chess-board-layout">
        {/* ◀ LEFT COLUMN: Back to Home */}
        <button
          onClick={() => navigate('/')}
          className="back-button"
        >
          🏠 Back to Home
        </button>
  
        {/* ◼ CENTER COLUMN: Chess Board */}
        <div className="chess-board-center">
          <Chessground
            width={boardSize}
            height={boardSize}
            config={config}
            contained={false}
          />
        </div>
  
        {/* ▶ RIGHT COLUMN: Move History + Controls */}
        <div className="chess-board-right">
          {/* Move History */}
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
  
          {/* Prev / Next / Live Controls */}
          <div className="move-history-controls">
            <button onClick={goBack} disabled={currentMoveIndex == null || currentMoveIndex <= 0}>
              ◀ Prev
            </button>
            <button onClick={goForward} disabled={currentMoveIndex == null || currentMoveIndex >= moveHistory.length - 1}>
              Next ▶
            </button>
            <button onClick={goLive} disabled={currentMoveIndex == null}>
              🔄 Live
            </button>
          </div>
        </div>
      </div>
    </div>
  );
  
};

export default ChessBoard;
