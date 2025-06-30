import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import Chessground from '@react-chess/chessground';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

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
  const [gameStarted, setGameStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
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
      orientation: playerSide || 'white',
      movable: {
        color: isPlayersTurn && gameStarted ? playerSide : null,
        dests: isPlayersTurn && gameStarted ? getDests(chess) : new Map(),
        showDests: true,
        free: false,
        events: {
          after: (from, to) => {
            if (!isPlayersTurn || !gameStarted) {
              console.log('❌ Not your turn or game not started, ignoring move');
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
                socket.emit('move', { move, gameId });
              }
            }
            catch (err) {
              console.warn('❌ Illegal move:', err);
            }
          },
        },
      },
      draggable: {
        enabled: isPlayersTurn && gameStarted,
        deleteOnDropOff: false,
      },
      premovable: {
        enabled: settings.premove !== 'none' && gameStarted,
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
    // Check authentication status
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsLoading(false);
      } else {
        // User is not authenticated, redirect to login
        navigate('/login');
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (isLoading) return; // Don't set up game if still loading auth

    const chess = chessRef.current;
    updateConfig();

    // Socket event handlers
    const handleConnect = () => {
      setIsConnected(true);
      console.log('✅ Connected to server');
      
      // Join the game room
      socket.emit('join-game', { gameId });
    };

    const handleOpponentMove = (data) => {
      console.log('📥 Received opponent move:', data);
      try {
        if (data.move) {
          chess.move(data.move);
          updateConfig();
          evaluateGameStatus();
        }
      } catch (e) {
        console.error('❌ Error applying opponent move:', e);
      }
    };

    const handleInvitationAccepted = (gameData) => {
      console.log('✅ Game started with invitation data:', gameData);
      console.log('📋 Invitation data received:', {
        roomId: gameData.roomId,
        side: gameData.side,
        opponent: gameData.opponent
      });
      
      setPlayerSide(gameData.side);
      setOpponentName(gameData.opponent);
      setGameStarted(true);
      
      // Update the chess instance with the current game state
      const chess = chessRef.current;
      // The game state will be received via the game-state event
      
      updateConfig();
      
      console.log('🎯 Updated client state from invitation:', {
        playerSide: gameData.side,
        opponentName: gameData.opponent,
        gameStarted: true
      });
    };

    const handleGameJoined = (gameData) => {
      console.log('✅ Joined existing game:', gameData);
      console.log('📋 Game data received:', {
        roomId: gameData.roomId,
        side: gameData.side,
        opponent: gameData.opponent
      });
      
      setPlayerSide(gameData.side);
      setOpponentName(gameData.opponent);
      setGameStarted(true);
      updateConfig();
      
      console.log('🎯 Updated client state:', {
        playerSide: gameData.side,
        opponentName: gameData.opponent,
        gameStarted: true
      });
    };

    const handleGameNotFound = () => {
      console.log('❌ Game not found, creating new game...');
      // If game doesn't exist, create it and wait for opponent
      socket.emit('create-game', { gameId });
    };

    const handleGameFull = (data) => {
      console.log('❌ Game is full:', data.message);
      alert('This game is full. Please create a new game.');
      navigate('/');
    };

    const handleOpponentJoined = (data) => {
      console.log('✅ Opponent joined:', data);
      console.log('📋 Opponent data:', {
        opponent: data.opponent
      });
      
      setOpponentName(data.opponent);
      setGameStarted(true);
      updateConfig();
      
      console.log('🎯 Updated client state from opponent joined:', {
        opponentName: data.opponent,
        gameStarted: true
      });
    };

    const handleGameState = (data) => {
      console.log('📥 Received game state:', data);
      console.log('📋 Game state data:', {
        fen: data.fen,
        turn: data.turn
      });
      
      const chess = chessRef.current;
      chess.load(data.fen);
      
      // Ensure game is marked as started when we receive game state
      setGameStarted(true);
      
      // Update the config with the new game state
      updateConfig();
      
      console.log('🎯 Updated chess instance with FEN:', data.fen);
      console.log('🎯 Current turn:', data.turn);
      console.log('🎯 Game started set to true');
    };

    const handleInvalidMove = (data) => {
      console.log('❌ Invalid move:', data.error);
      alert(`Invalid move: ${data.error}`);
    };

    const handleGameOver = (data) => {
      console.log('🏁 Game over:', data);
      if (data.isCheckmate) {
        setGameStatus(`${data.winner.toUpperCase()} won by checkmate!`);
      } else if (data.isStalemate) {
        setGameStatus('Draw by stalemate');
      } else if (data.isDraw) {
        setGameStatus('Draw');
      }
    };

    // Set up socket event listeners
    socket.on('connect', handleConnect);
    socket.on('opponent-move', handleOpponentMove);
    socket.on('invitation-accepted', handleInvitationAccepted);
    socket.on('game-joined', handleGameJoined);
    socket.on('game-not-found', handleGameNotFound);
    socket.on('game-full', handleGameFull);
    socket.on('opponent-joined', handleOpponentJoined);
    socket.on('game-state', handleGameState);
    socket.on('invalid-move', handleInvalidMove);
    socket.on('game-over', handleGameOver);

    // Connect to socket if not already connected
    if (!socket.connected) {
      socket.connect();
    }

    // Fallback: If after 3 seconds we still don't have a player side, try to join again
    const fallbackTimer = setTimeout(() => {
      if (!playerSide) {
        console.log('⚠️ Fallback: No player side assigned, trying to join again...');
        socket.emit('join-game', { gameId });
      }
    }, 3000);

    return () => {
      clearTimeout(fallbackTimer);
      socket.off('connect', handleConnect);
      socket.off('opponent-move', handleOpponentMove);
      socket.off('invitation-accepted', handleInvitationAccepted);
      socket.off('game-joined', handleGameJoined);
      socket.off('game-not-found', handleGameNotFound);
      socket.off('game-full', handleGameFull);
      socket.off('opponent-joined', handleOpponentJoined);
      socket.off('game-state', handleGameState);
      socket.off('invalid-move', handleInvalidMove);
      socket.off('game-over', handleGameOver);
    };
  }, [gameId, isLoading, playerSide]);

  useEffect(() => {
    if (playerSide) {
      updateConfig();
    }
  }, [playerSide, gameStarted]);

  // Show loading while checking authentication
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
            {!gameStarted && (
              <p style={{ color: '#FFA500', margin: '10px 0 0 0', fontSize: '14px' }}>
                ⏳ Waiting for opponent to join...
              </p>
            )}
            {gameStarted && (
              <p style={{ color: '#4CAF50', margin: '10px 0 0 0', fontSize: '14px' }}>
                ✅ Game is active - {config.turnColor === playerSide ? 'Your turn' : 'Opponent\'s turn'}
              </p>
            )}
          </div>
        )}

        {/* Debug Info */}
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
