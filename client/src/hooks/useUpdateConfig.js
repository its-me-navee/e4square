import { useCallback } from 'react';
import { getDests, getSettings } from '../utils/chessUtils';
import { evaluateGameStatus } from '../utils/gameStatus';
import socket from '../socket';

export const useUpdateConfig = ({
  chessRef,
  playerSide,
  gameStarted,
  setConfig,
  setMoveHistory,
  setCurrentMoveIndex,
  setGameStatus,
  gameId
}) => {
  const updateConfig = useCallback(() => {
    const chess = chessRef.current;

    const currentTurn = chess.turn() === 'w' ? 'white' : 'black';
    const isPlayersTurn = playerSide === currentTurn;
    const settings = getSettings();

    const history = chess.history({ verbose: true });
    const lastMoveObj = history.length > 0 ? history[history.length - 1] : null;
    const lastMove = lastMoveObj ? [lastMoveObj.from, lastMoveObj.to] : [];

    setConfig({
      fen: chess.fen(),
      turnColor: currentTurn,
      orientation: playerSide || 'white',
      lastMove,
            movable: {
        color: isPlayersTurn && gameStarted ? playerSide : null,
        dests: isPlayersTurn && gameStarted ? getDests(chess) : new Map(),
        showDests: true,
        free: false,
        events: {
          after: (from, to) => {
            console.log(`🎯 Move attempted: ${from} -> ${to}, Player: ${playerSide}, Turn: ${currentTurn}, GameStarted: ${gameStarted}`);
            if (!isPlayersTurn || !gameStarted) {
              console.log('❌ Not your turn or game not started');
              return;
            }

            const piece = chess.get(from);
            let promotion = undefined;
            if (
              piece?.type === 'p' &&
              ((piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1'))
            ) {
              promotion = settings.autoQueen ? 'q' : prompt('Promote to? (q/r/b/n)', 'q');
            }

            try {
              const move = chess.move({ from, to, promotion });
              if (move) {
                const newMove = { move, fen: chess.fen() };
                setMoveHistory(prev => [...prev, newMove]);
                setCurrentMoveIndex(null);
                // Pass the move that was just made to updateConfig
                updateConfig([from, to]);
                const status = evaluateGameStatus(chess);
                setGameStatus(status);
                // Send the move object that server expects
                console.log(`📤 Sending move to server:`, { from, to, promotion });
                socket.emit('move', { 
                  move: { from, to, promotion }, 
                  gameId 
                });
              }
            } catch (err) {
              console.warn('Illegal move:', err);
            }
          }
        }
      },
      draggable: {
        enabled: isPlayersTurn && gameStarted,
        deleteOnDropOff: false
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
      check: chess.inCheck()
        ? (chess.turn() === 'w' ? 'white' : 'black')
        : false,
      animation: {
        enabled: true,
        duration: 150
      }
    });
  }, [
    chessRef,
    playerSide,
    gameStarted,
    setConfig,
    setMoveHistory,
    setCurrentMoveIndex,
    setGameStatus,
    gameId
  ]);

  return updateConfig;
};
