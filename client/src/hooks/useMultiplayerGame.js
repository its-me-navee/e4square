import { useCallback, useEffect, useState } from 'react';
import socket, { connectSocket } from '../socket';
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
  setClocks,
  setOpponentConnection,
  setGameResult,
  navigate
}) => {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [connectionStatus, setConnectionStatus] = useState(socket.connected ? 'connected' : 'connecting');

  const resignGame = useCallback(() => {
    if (!socket.connected) {
      connectSocket({ forceRefresh: true });
    }
    socket.emit('resign-game', { gameId });
  }, [gameId]);

  useEffect(() => {
    const chess = chessRef.current;
    let active = true;
    let joined = false;
    let joinRetryTimer = null;
    let joinRetryAttempt = 0;

    const clearJoinRetry = () => {
      if (joinRetryTimer) {
        clearTimeout(joinRetryTimer);
        joinRetryTimer = null;
      }
    };

    const markJoined = () => {
      joined = true;
      joinRetryAttempt = 0;
      clearJoinRetry();
    };

    const scheduleJoinRetry = () => {
      clearJoinRetry();
      if (!active || joined) return;

      const delay = Math.min(1000 * (2 ** joinRetryAttempt), 8000);
      joinRetryAttempt = Math.min(joinRetryAttempt + 1, 5);
      joinRetryTimer = setTimeout(() => {
        emitJoin();
      }, delay);
    };

    const emitJoin = () => {
      if (!active || joined) return;

      if (!socket.connected) {
        scheduleJoinRetry();
        return;
      }

      socket.emit('join-game', { gameId });
      scheduleJoinRetry();
    };

    const handleConnect = () => {
      setIsConnected(true);
      setConnectionStatus('connected');
      joined = false;
      joinRetryAttempt = 0;
      emitJoin();
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setConnectionStatus(navigator.onLine === false ? 'offline' : 'reconnecting');
      joined = false;
      scheduleJoinRetry();
    };

    const handleConnectError = () => {
      setIsConnected(false);
      setConnectionStatus(navigator.onLine === false ? 'offline' : 'reconnecting');
      scheduleJoinRetry();
    };

    const handleReconnectAttempt = () => {
      setIsConnected(false);
      setConnectionStatus('reconnecting');
    };

    const handleReconnect = () => {
      setIsConnected(true);
      setConnectionStatus('connected');
      joined = false;
      joinRetryAttempt = 0;
      emitJoin();
    };

    const handleOnline = () => {
      setConnectionStatus('reconnecting');
      connectSocket({ forceRefresh: true });
      emitJoin();
    };

    const handleOffline = () => {
      setIsConnected(false);
      setConnectionStatus('offline');
    };

    const handleOpponentMove = ({ move, clocks }) => {
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
        if (clocks) setClocks(clocks);
      } catch (err) {
        console.error('Error applying opponent move:', err);
      }
    };

    const handleInvitationAccepted = ({ side, opponent, clocks, result }) => {
      markJoined();
      setPlayerSide(side);
      setOpponentName(opponent);
      setGameStarted(true);
      if (clocks) setClocks(clocks);
      if (result) {
        setGameResult(result);
        setGameStatus(result.message || '');
      }
      updateConfig();
    };

    const handleGameJoined = ({ side, opponent, clocks, result }) => {
      markJoined();
      setPlayerSide(side);
      setOpponentName(opponent);
      setGameStarted(true);
      if (clocks) setClocks(clocks);
      if (result) {
        setGameResult(result);
        setGameStatus(result.message || '');
      }
      updateConfig();
    };

    const handleGameState = ({ fen, moves, clocks, result, disconnected }) => {
      markJoined();
      console.log(`📋 Received game state:`, { fen, movesCount: moves?.length });
      try {
        chess.load(fen);
        setMoveHistory(Array.isArray(moves) ? moves : []);
        setCurrentMoveIndex(null);
        setGameStarted(true);
        if (clocks) setClocks(clocks);
        if (result) {
          setGameResult(result);
          setGameStatus(result.message || '');
        } else {
          setGameResult(null);
        }
        const disconnectedPlayer = Array.isArray(disconnected) && disconnected.length > 0
          ? disconnected[0]
          : null;
        setOpponentConnection(disconnectedPlayer);
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
      scheduleJoinRetry();
    };

    const handleGameFull = ({ message }) => {
      alert(message || 'Game full.');
      navigate('/');
    };

    const handleOpponentJoined = ({ opponent }) => {
      setOpponentName(opponent);
      setGameStarted(true);
      setOpponentConnection(null);
      updateConfig();
    };

    const handleInvalidMove = ({ error }) => {
      alert(`Invalid move: ${error}`);
    };

    const handleGameOver = (data) => {
      setGameResult(data);
      setOpponentConnection(null);

      if (data.message) {
        setGameStatus(data.message);
      } else if (data.isCheckmate) {
        setGameStatus(`${data.winner.toUpperCase()} won by checkmate!`);
      } else if (data.isStalemate) {
        setGameStatus('Draw by stalemate');
      } else if (data.isDraw) {
        setGameStatus('Draw');
      }
      updateConfig();
    };

    const handleClockUpdate = ({ clocks, result }) => {
      if (clocks) setClocks(clocks);
      if (result) {
        setGameResult(result);
        setGameStatus(result.message || '');
      }
    };

    const handleOpponentDisconnected = ({ side, abandonmentDeadline }) => {
      setOpponentConnection({ side, abandonmentDeadline });
    };

    const handleOpponentReconnected = () => {
      setOpponentConnection(null);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('opponent-move', handleOpponentMove);
    socket.on('move-confirmed', handleClockUpdate);
    socket.on('invitation-accepted', handleInvitationAccepted);
    socket.on('game-joined', handleGameJoined);
    socket.on('game-state', handleGameState);
    socket.on('game-not-found', handleGameNotFound);
    socket.on('game-full', handleGameFull);
    socket.on('opponent-joined', handleOpponentJoined);
    socket.on('opponent-disconnected', handleOpponentDisconnected);
    socket.on('opponent-reconnected', handleOpponentReconnected);
    socket.on('clock-update', handleClockUpdate);
    socket.on('invalid-move', handleInvalidMove);
    socket.on('game-over', handleGameOver);
    socket.io.on('reconnect_attempt', handleReconnectAttempt);
    socket.io.on('reconnect', handleReconnect);
    socket.io.on('reconnect_error', handleConnectError);
    socket.io.on('reconnect_failed', handleConnectError);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (!socket.connected) {
      connectSocket();
      emitJoin();
    } else {
      handleConnect();
    }

    return () => {
      active = false;
      clearJoinRetry();
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('opponent-move', handleOpponentMove);
      socket.off('move-confirmed', handleClockUpdate);
      socket.off('invitation-accepted', handleInvitationAccepted);
      socket.off('game-joined', handleGameJoined);
      socket.off('game-state', handleGameState);
      socket.off('game-not-found', handleGameNotFound);
      socket.off('game-full', handleGameFull);
      socket.off('opponent-joined', handleOpponentJoined);
      socket.off('opponent-disconnected', handleOpponentDisconnected);
      socket.off('opponent-reconnected', handleOpponentReconnected);
      socket.off('clock-update', handleClockUpdate);
      socket.off('invalid-move', handleInvalidMove);
      socket.off('game-over', handleGameOver);
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
      socket.io.off('reconnect', handleReconnect);
      socket.io.off('reconnect_error', handleConnectError);
      socket.io.off('reconnect_failed', handleConnectError);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [
    chessRef,
    gameId,
    navigate,
    setClocks,
    setCurrentMoveIndex,
    setGameResult,
    setGameStarted,
    setGameStatus,
    setMoveHistory,
    setOpponentConnection,
    setOpponentName,
    setPlayerSide,
    updateConfig
  ]);

  return { isConnected, connectionStatus, resignGame };
};
