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
    <div style={{ background: 'linear-gradient(to right, #2a2a2a, #4d4d4d)', minHeight: '100vh' }}>
      <Header />
    
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px', gap: '20px' }}>
        {/* ◀ LEFT COLUMN: Back to Home */}
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            color: 'white',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            padding: '10px 20px',
            borderRadius: '25px',
            cursor: 'pointer',
            fontSize: '14px',
            alignSelf: 'start'          // keeps it at top
          }}
        >
          🏠 Back to Home
        </button>
  
        {/* ◼ CENTER COLUMN: Chess Board */}
        <div style={{ textAlign: 'center' }}>
          <Chessground
            width={520}
            height={520}
            config={config}
            contained={false}
          />
        </div>
  
        {/* ▶ RIGHT COLUMN: Move History + Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          {/* Move History */}
          <div style={{
            maxHeight: '500px',
            overflowY: 'auto',
            color: 'white',
            fontSize: '14px',
            padding: '10px',
            background: '#1e1e1e',
            borderRadius: '8px',
            minWidth: '200px'
          }}>
            <h4 style={{ marginTop: 0, color: '#7ec8e3' }}>Move History</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                      style={{
                        cursor: 'pointer',
                        color: currentMoveIndex === idx * 2 ? '#FFD700' : 'white'
                      }}
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
                      style={{
                        cursor: 'pointer',
                        color: currentMoveIndex === idx * 2 + 1 ? '#FFD700' : 'white'
                      }}
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
          <div style={{ display: 'flex', gap: '10px' }}>
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
