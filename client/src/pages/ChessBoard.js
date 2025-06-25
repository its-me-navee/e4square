import React, { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Chessground from '@react-chess/chessground';

import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

import socket from '../socket';

const ChessBoard = () => {
  const chessRef = useRef(new Chess());
  const [config, setConfig] = useState({});

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
    setConfig({
      fen: chess.fen(),
      turnColor: chess.turn() === 'w' ? 'white' : 'black',
      movable: {
        color: chess.turn() === 'w' ? 'white' : 'black',
        dests: getDests(chess),
        showDests: true,
        free: false,
        events: {
          after: (from, to) => {
            try {
                const move = chess.move({ from, to, promotion: 'q' });
                if (move) {
                  updateConfig();
                  socket.emit('move', move);
                }
            }
            catch (err) {
                console.warn('Illegal move:', err);
            }
          },
        },
      },
      draggable: {
        enabled: true,
        deleteOnDropOff: false,
      },
      highlight: {
        lastMove: true,
        check: true,
      },
      animation: {
        enabled: true,
        duration: 150,
      },
    });
  };

  useEffect(() => {
    const chess = chessRef.current;
    updateConfig();

    socket.on('connect', () => {
      console.log('Connected to server:', socket.id);
    });

    socket.on('opponent-move', (move) => {
      chess.move(move);
      updateConfig();
    });

    return () => {
      socket.off('connect');
      socket.off('opponent-move');
    };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#262421', minHeight: '100vh', padding: '20px' }}>
      <h2 style={{ color: 'white', marginBottom: '20px' }}>E4Square - Chessground</h2>
      <Chessground
        width={520}
        height={520}
        config={config}
        contained={false}
      />
    </div>
  );
};

export default ChessBoard;
