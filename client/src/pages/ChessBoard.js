import React, { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Chessground from '@react-chess/chessground';

import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

import socket from '../socket';

import Header from '../components/Header'; // adjust path as needed


const ChessBoard = () => {
  const chessRef = useRef(new Chess());
  const [config, setConfig] = useState({});
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
      premovable: {
        enabled: settings.premove !== 'none',
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
    <div style={{ background: '#262421', minHeight: '100vh' }}>
    <Header />
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#262421', minHeight: '100vh', padding: '20px' }}>
      <h2 style={{ color: 'white', marginBottom: '20px' }}>E4Square - Chessground</h2>
      <Chessground
        width={520}
        height={520}
        config={config}
        contained={false}
      />
    </div>
    </div>
  );
};

export default ChessBoard;
