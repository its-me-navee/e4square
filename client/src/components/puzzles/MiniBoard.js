import React from 'react';

const PIECES = {
  p: '♟',
  n: '♞',
  b: '♝',
  r: '♜',
  q: '♛',
  k: '♚',
  P: '♙',
  N: '♘',
  B: '♗',
  R: '♖',
  Q: '♕',
  K: '♔',
};

const parseFenBoard = (fen) => {
  const board = fen?.split(' ')[0];
  if (!board) return null;

  const rows = board.split('/').map((row) => {
    const squares = [];
    for (const char of row) {
      if (/\d/.test(char)) {
        for (let index = 0; index < Number(char); index += 1) {
          squares.push(null);
        }
      } else {
        squares.push(char);
      }
    }
    return squares;
  });

  if (rows.length !== 8 || rows.some((row) => row.length !== 8)) return null;
  return rows;
};

const MiniBoard = ({ fen }) => {
  const rows = parseFenBoard(fen);
  const orientation = fen?.split(' ')[1] === 'b' ? 'black' : 'white';
  const displayRows = orientation === 'black'
    ? rows?.slice().reverse().map((row) => row.slice().reverse())
    : rows;

  if (!displayRows) {
    return <div className="puzzle-mini-board-empty" />;
  }

  return (
    <div className="puzzle-mini-frame" aria-label="Puzzle preview board">
      <div className="puzzle-mini-board-static">
        {displayRows.flatMap((row, rowIndex) => (
          row.map((piece, colIndex) => {
            const isLight = (rowIndex + colIndex) % 2 === 0;
            const pieceColor = piece && piece === piece.toUpperCase() ? 'white' : 'black';

            return (
              <span
                key={`${rowIndex}-${colIndex}`}
                className={`mini-square ${isLight ? 'light' : 'dark'} ${pieceColor || ''}`}
              >
                {piece ? PIECES[piece] : ''}
              </span>
            );
          })
        ))}
      </div>
    </div>
  );
};

export default React.memo(MiniBoard);
