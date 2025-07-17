export const useMoveNavigation = ({
    chessRef,
    moveHistory,
    currentMoveIndex,
    setCurrentMoveIndex,
    updateConfig
  }) => {
    const goBack = () => {
      if (currentMoveIndex > 0) {
        const prev = moveHistory[currentMoveIndex - 1];
        console.log("⬅️ Go back to:", prev);
        chessRef.current.load(prev.fen);
        setCurrentMoveIndex(currentMoveIndex - 1);
        // Pass the move that led to this FEN
        const moveObj = prev?.move;
        updateConfig(moveObj ? [moveObj.from, moveObj.to] : []);
      }
    };
  
    const goForward = () => {
      if (currentMoveIndex < moveHistory.length - 1) {
        const next = moveHistory[currentMoveIndex + 1];
        console.log("➡️ Go forward to:", next);
        chessRef.current.load(next.fen);
        setCurrentMoveIndex(currentMoveIndex + 1);
        // Pass the move that led to this FEN
        const moveObj = next?.move;
        updateConfig(moveObj ? [moveObj.from, moveObj.to] : []);
      } else {
        goLive();
      }
    };
  
    const goLive = () => {
      const liveFen = moveHistory.length > 0
        ? moveHistory[moveHistory.length - 1].fen
        : chessRef.current.fen(); // fallback if no history
  
      console.log("🏁 Returning to live board");
      chessRef.current.load(liveFen);
      setCurrentMoveIndex(null);
      // For live board, use the last move from the move history
      const lastMoveObj = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1]?.move : null;
      updateConfig(lastMoveObj ? [lastMoveObj.from, lastMoveObj.to] : []);
    };
  
    return { goBack, goForward, goLive };
  };
  