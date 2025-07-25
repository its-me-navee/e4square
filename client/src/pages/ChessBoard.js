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

  if (isLoading) {
    return (
      <div style={{
        background: '#262421',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ color: 'white', fontSize: '18px' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#262421', minHeight: '100vh' }}>
      <Header />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px' }}>
        <h2 style={{ color: 'white', marginBottom: '20px' }}>E4Square - Chessground</h2>

        {/* Connection Status */}
        <div style={{
          color: isConnected ? '#4CAF50' : '#f44336',
          marginBottom: '10px',
          fontSize: '14px'
        }}>
          {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </div>

        {/* Player Info */}
        {playerSide && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            padding: '15px',
            borderRadius: '10px',
            marginBottom: '20px',
            textAlign: 'center',
            minWidth: '300px'
          }}>
            <p style={{ color: 'white', marginBottom: 5 }}>
              You are playing as <strong style={{ color: '#FFD700' }}>{playerSide.toUpperCase()}</strong>
            </p>
            {opponentName && (
              <p style={{ color: 'white', opacity: 0.8 }}>
                vs <strong>{opponentName}</strong>
              </p>
            )}
            {!gameStarted ? (
              <p style={{ color: '#FFA500', marginTop: 10, fontSize: '14px' }}>
                ⏳ Waiting for opponent to join...
              </p>
            ) : (
              <p style={{ color: '#4CAF50', marginTop: 10, fontSize: '14px' }}>
                ✅ Game is active - {config.turnColor === playerSide ? 'Your turn' : "Opponent's turn"}
              </p>
            )}
          </div>
        )}

        {/* Debug */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          padding: '10px',
          borderRadius: '5px',
          marginBottom: '10px',
          fontSize: '12px',
          color: 'rgba(255, 255, 255, 0.7)'
        }}>
          <p>Debug: PlayerSide={playerSide}, GameStarted={gameStarted.toString()}, Turn={config.turnColor}</p>
        </div>

        {gameStatus && (
          <div style={{ color: 'lightgreen', marginBottom: '20px', fontSize: '18px' }}>
            {gameStatus}
          </div>
        )}

        <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', alignItems: 'flex-start' }}>
          {/* Move History */}
          <div style={{
            maxHeight: '500px',
            overflowY: 'auto',
            color: 'white',
            fontSize: '14px',
            padding: '10px',
            background: '#1e1e1e',
            borderRadius: '8px',
            minWidth: '150px'
          }}>
            <h4 style={{ marginTop: 0 }}>Move History</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: '#FFD700' }}>
                  <th>#</th>
                  <th>{playerSide === 'white' ? 'You' : opponentName || 'White'}</th>
                  <th>{playerSide === 'black' ? 'You' : opponentName || 'Black'}</th>
                </tr>
              </thead>
              <tbody>
                {groupedMoves(moveHistory).map((row, index) => (
                  <tr key={index}>
                    <td>{row.moveNo}</td>
                    <td
                      style={{ cursor: 'pointer', color: currentMoveIndex === index * 2 ? '#FFD700' : 'white' }}
                      onClick={() => {
                        chessRef.current.load(moveHistory[index * 2]?.fen);
                        setCurrentMoveIndex(index * 2);
                        // Pass the move that led to this FEN
                        const moveObj = moveHistory[index * 2]?.move;
                        updateConfig(moveObj ? [moveObj.from, moveObj.to] : []);
                      }}
                    >
                      {row.whiteMove}
                    </td>
                    <td
                      style={{ cursor: 'pointer', color: currentMoveIndex === index * 2 + 1 ? '#FFD700' : 'white' }}
                      onClick={() => {
                        chessRef.current.load(moveHistory[index * 2 + 1]?.fen);
                        setCurrentMoveIndex(index * 2 + 1);
                        // Pass the move that led to this FEN
                        const moveObj = moveHistory[index * 2 + 1]?.move;
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

          {/* Chess Board */}
          <div>
            <Chessground
              width={520}
              height={520}
              config={config}
              contained={false}
            />
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px', gap: '10px' }}>
              <button onClick={goBack} disabled={currentMoveIndex === null || currentMoveIndex <= 0}>◀ Prev</button>
              <button onClick={goForward} disabled={currentMoveIndex === null || currentMoveIndex >= moveHistory.length - 1}>Next ▶</button>
              <button onClick={goLive} disabled={currentMoveIndex === null}>🔄 Live</button>
            </div>
          </div>
        </div>

        {/* Back Button */}
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            color: 'white',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            padding: '10px 20px',
            borderRadius: '25px',
            cursor: 'pointer',
            marginTop: '20px',
            fontSize: '14px'
          }}
        >
          🏠 Back to Home
        </button>
      </div>
    </div>
  );
};

export default ChessBoard;
