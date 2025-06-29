import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import Chessground from '@react-chess/chessground';

import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

import socket from '../socket';
import Header from '../components/Header';

const ChessBoard = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const chessRef = useRef(new Chess());
  const [config, setConfig] = useState({});
  const [gameStatus, setGameStatus] = useState('');
  const [playerSide, setPlayerSide] = useState(null);
  const [opponentName, setOpponentName] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const settings = JSON.parse(localStorage.getItem('e4square-settings')) || {
    premove: 'single',
    autoQueen: true,
  };

  const getAllSquares = () => {
    const squares = [];
    const files = 'abcdefgh';
    const ranks = '12345678';
    for (let f of files) {
      for (let r of ranks) {
        squares.push(f + r);
      }
    }
    return squares;
  };

  const getDests = (chess) => {
    const dests = new Map();
    for (const square of getAllSquares()) {
      const moves = chess.moves({ square, verbose: true });
      if (moves.length) dests.set(square, moves.map(m => m.to));
    }
    return dests;
  };

  const updateConfig = () => {
    const chess = chessRef.current;
    const checkColor = chess.inCheck() ? chess.turn() : false;
    const currentTurn = chess.turn() === 'w' ? 'white' : 'black';
    const isPlayersTurn = playerSide === currentTurn;

    setConfig({
      fen: chess.fen(),
      turnColor: currentTurn,
      movable: {
        color: isPlayersTurn ? playerSide : null,
        dests: isPlayersTurn ? getDests(chess) : new Map(),
        showDests: true,
        free: false,
        events: {
          after: (from, to) => {
            if (!isPlayersTurn) {
              console.log('❌ Not your turn, ignoring move');
              return;
            }

            const piece = chess.get(from);
            let promotionPiece = undefined;
            if (
              piece?.type === 'p' &&
              ((piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1'))
            ) {
              promotionPiece = settings.autoQueen ? 'q' : prompt("Promote to? (q/r/b/n)", "q");
            }
            try {
              const move = chess.move({ from, to, promotion: promotionPiece });
              if (move) {
                console.log(`✅ Move successful: ${move.from} -> ${move.to}`);
                updateConfig();
                evaluateGameStatus();
                socket.emit('move', move);
              }
            }
            catch (err) {
              console.warn('❌ Illegal move:', err);
            }
          },
        },
      },
      draggable: {
        enabled: isPlayersTurn,
        deleteOnDropOff: false,
      },
      premovable: {
        enabled: settings.premove !== 'none',
        castle: true,
        showDests: true
      },
      highlight: {
        lastMove: true,
        check: true,
      },
      check: checkColor === 'w' ? 'white' : checkColor === 'b' ? 'black' : false,
      animation: {
        enabled: true,
        duration: 150,
      },
    });
  };

  const evaluateGameStatus = () => {
    const chess = chessRef.current;

    if (chess.isGameOver()) {
      if (chess.isCheckmate()) {
        const winner = chess.turn() === 'w' ? 'Black' : 'White';
        setGameStatus(`${winner} won by checkmate`);
      } else if (chess.isStalemate()) {
        setGameStatus('Draw by stalemate');
      } else if (chess.isThreefoldRepetition()) {
        setGameStatus('Draw by threefold repetition');
      } else if (chess.isInsufficientMaterial()) {
        setGameStatus('Draw due to insufficient material');
      } else if (chess.isDraw()) {
        setGameStatus('Draw');
      }
    } else {
      setGameStatus('');
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      window.location.href = '/login';
      return;
    }

    const chess = chessRef.current;
    updateConfig();

    // Socket event handlers
    const handleConnect = () => {
      setIsConnected(true);
      console.log('✅ Connected to server');
    };

    const handleOpponentMove = (move) => {
      console.log('📥 Received opponent move:', move);
      try {
        chess.move(move);
        updateConfig();
        evaluateGameStatus();
      } catch (e) {
        console.error('❌ Error applying opponent move:', e);
      }
    };

    const handleInvitationAccepted = (gameData) => {
      console.log('✅ Game started with invitation data:', gameData);
      setPlayerSide(gameData.side);
      setOpponentName(gameData.opponent);
      updateConfig();
    };

    // Set up socket event listeners
    socket.on('connect', handleConnect);
    socket.on('opponent-move', handleOpponentMove);
    socket.on('invitation-accepted', handleInvitationAccepted);

    // Connect to socket if not already connected
    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('opponent-move', handleOpponentMove);
      socket.off('invitation-accepted', handleInvitationAccepted);
    };
  }, []);

  useEffect(() => {
    if (playerSide) {
      updateConfig();
    }
  }, [playerSide]);

  return (
    <div style={{ background: '#262421', minHeight: '100vh' }}>
      <Header />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#262421', minHeight: '100vh', padding: '20px' }}>
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
            <p style={{ color: 'white', margin: '0 0 10px 0', fontSize: '16px' }}>
              You are playing as <strong style={{ color: '#FFD700' }}>{playerSide.toUpperCase()}</strong>
            </p>
            {opponentName && (
              <p style={{ color: 'white', margin: 0, opacity: 0.8 }}>
                vs <strong>{opponentName}</strong>
              </p>
            )}
          </div>
        )}

        {gameStatus && (
          <div style={{ color: 'lightgreen', marginBottom: '20px', fontSize: '18px' }}>
            {gameStatus}
          </div>
        )}

        <Chessground
          width={520}
          height={520}
          config={config}
          contained={false}
        />

        {/* Back to Home Button */}
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
