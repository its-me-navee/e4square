export const getAllSquares = () => {
    const squares = [];
    const files = 'abcdefgh';
    const ranks = '12345678';
    for (let f of files) {
      for (let r of ranks) squares.push(f + r);
    }
    return squares;
  };
  
  export const getDests = (chess) => {
    const dests = new Map();
    for (const square of getAllSquares()) {
      const moves = chess.moves({ square, verbose: true });
      if (moves.length) dests.set(square, moves.map(m => m.to));
    }
    return dests;
  };
  
  export const getSettings = () => {
    return JSON.parse(localStorage.getItem('e4square-settings')) || {
      premove: 'single',
      autoQueen: true,
    };
  };
  
  export const groupedMoves = (moveHistory) => {
    const grouped = [];
    for (let i = 0; i < moveHistory.length; i += 2) {
      const whiteMove = moveHistory[i]?.move.san || '';
      const blackMove = moveHistory[i + 1]?.move.san || '';
      grouped.push({ 
        moveNo: Math.floor(i / 2) + 1, 
        whiteMove, 
        blackMove 
      });
    }
    return grouped;
  };
  