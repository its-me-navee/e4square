import { useEffect, useState } from 'react';
import socket from '../socket';
import { evaluateGameStatus } from '../utils/gameStatus';

export const useMultiplayerGame = ({
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
}) => {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const chess = chessRef.current;

    const handleConnect = () => {
      setIsConnected(true);
      socket.emit('join-game', { gameId });
    };

    const handleOpponentMove = ({ move }) => {
      console.log(`📥 Received opponent move:`, move);
      try {
        // Apply the opponent's move to our local chess instance
        const result = chess.move(move);
        if (result) {
          console.log(`✅ Applied opponent move: ${result.from} -> ${result.to}`);
          setMoveHistory(prev => [...prev, { move: result, fen: chess.fen() }]);
          setCurrentMoveIndex(null);
          // Pass the opponent's move to updateConfig for proper highlighting
          updateConfig([result.from, result.to]);
          
          // Check for game over conditions
          const status = evaluateGameStatus(chess);
          if (status) {
            setGameStatus(status);
          }
        }
      } catch (err) {
        console.error('Error applying opponent move:', err);
      }
    };

    const handleInvitationAccepted = ({ side, opponent }) => {
      setPlayerSide(side);
      setOpponentName(opponent);
      setGameStarted(true);
      updateConfig();
    };

    const handleGameJoined = ({ side, opponent }) => {
      setPlayerSide(side);
      setOpponentName(opponent);
      setGameStarted(true);
      updateConfig();
    };

    const handleGameState = ({ fen, moves }) => {
      console.log(`📋 Received game state:`, { fen, movesCount: moves?.length });
      try {
        chess.load(fen);
        setMoveHistory(Array.isArray(moves) ? moves : []);
        setCurrentMoveIndex(null);
        setGameStarted(true);
        updateConfig();
        
        // Check for game over conditions
        const status = evaluateGameStatus(chess);
        if (status) {
          setGameStatus(status);
        }
      } catch (err) {
        console.error('Error loading game state:', err);
      }
    };

    const handleGameNotFound = () => {
      socket.emit('create-game', { gameId });
    };

    const handleGameFull = ({ message }) => {
      alert(message || 'Game full.');
      navigate('/');
    };

    const handleOpponentJoined = ({ opponent }) => {
      setOpponentName(opponent);
      setGameStarted(true);
      updateConfig();
    };

    const handleInvalidMove = ({ error }) => {
      alert(`Invalid move: ${error}`);
    };

    const handleGameOver = (data) => {
      if (data.isCheckmate) {
        setGameStatus(`${data.winner.toUpperCase()} won by checkmate!`);
      } else if (data.isStalemate) {
        setGameStatus('Draw by stalemate');
      } else if (data.isDraw) {
        setGameStatus('Draw');
      }
    };

    socket.on('connect', handleConnect);
    socket.on('opponent-move', handleOpponentMove);
    socket.on('invitation-accepted', handleInvitationAccepted);
    socket.on('game-joined', handleGameJoined);
    socket.on('game-state', handleGameState);
    socket.on('game-not-found', handleGameNotFound);
    socket.on('game-full', handleGameFull);
    socket.on('opponent-joined', handleOpponentJoined);
    socket.on('invalid-move', handleInvalidMove);
    socket.on('game-over', handleGameOver);

    if (!socket.connected) {
      socket.connect();
    }

    const fallbackTimer = setTimeout(() => {
      socket.emit('join-game', { gameId });
    }, 3000);

    return () => {
      clearTimeout(fallbackTimer);
      socket.off('connect', handleConnect);
      socket.off('opponent-move', handleOpponentMove);
      socket.off('invitation-accepted', handleInvitationAccepted);
      socket.off('game-joined', handleGameJoined);
      socket.off('game-state', handleGameState);
      socket.off('game-not-found', handleGameNotFound);
      socket.off('game-full', handleGameFull);
      socket.off('opponent-joined', handleOpponentJoined);
      socket.off('invalid-move', handleInvalidMove);
      socket.off('game-over', handleGameOver);
    };
  }, [gameId, updateConfig]);

  return { isConnected };
};
