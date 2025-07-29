import { useCallback } from 'react';
import { getDests, getSettings } from '../utils/chessUtils';
import { evaluateGameStatus } from '../utils/gameStatus';

export const useBotUpdateConfig = ({
  chessRef,
  playerSide,
  setConfig,
  setMoveHistory,
  setCurrentMoveIndex,
  setGameStatus,
  onPlayerMove
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
      orientation: playerSide,
      lastMove,
      movable: {
        color: isPlayersTurn ? playerSide : null,
        dests: isPlayersTurn ? getDests(chess) : new Map(),
        showDests: true,
        free: false,
        events: {
          after: (from, to) => {
            const piece = chess.get(from);
            let promotion;

            if (
              piece?.type === 'p' &&
              ((piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1'))
            ) {
              promotion = settings.autoQueen ? 'q' : prompt('Promote to? (q/r/b/n)', 'q');
            }

            try {
              const move = chess.move({ from, to, promotion });
              if (move) {
                setMoveHistory(prev => [...prev, { move, fen: chess.fen() }]);
                setCurrentMoveIndex(null);
                updateConfig();

                const status = evaluateGameStatus(chess);
                setGameStatus(status);

                if (!status && typeof onPlayerMove === 'function') {
                  onPlayerMove(from, to, promotion);
                }
              }
            } catch (err) {
              console.warn('Illegal move:', err);
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
        showDests: true,
      },
      highlight: {
        lastMove: true,
        check: true,
      },
      check: chess.inCheck() ? currentTurn : false,
      animation: {
        enabled: true,
        duration: 150,
      },
    });
  }, [
    chessRef,
    playerSide,
    setConfig,
    setMoveHistory,
    setCurrentMoveIndex,
    setGameStatus,
    onPlayerMove,
  ]);

  return updateConfig;
};
