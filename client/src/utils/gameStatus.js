export const evaluateGameStatus = (chess) => {
    if (chess.isCheckmate()) {
      const winner = chess.turn() === 'w' ? 'Black' : 'White';
      return `${winner} won by checkmate`;
    }
    if (chess.isStalemate()) return 'Draw by stalemate';
    if (chess.isThreefoldRepetition()) return 'Draw by threefold repetition';
    if (chess.isInsufficientMaterial()) return 'Draw due to insufficient material';
    if (chess.isDraw()) return 'Draw';
    return '';
  };
  