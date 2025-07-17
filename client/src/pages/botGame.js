import React, { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Chessground from '@react-chess/chessground';
import { useNavigate } from 'react-router-dom';

import Header from '../components/Header';
import { evaluateGameStatus } from '../utils/gameStatus';

import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

const BotGame = () => {
  const navigate = useNavigate();
  const chessRef = useRef(new Chess());
  const engineRef = useRef(null);

  const [playerSide, setPlayerSide] = useState('white');
  const [config, setConfig] = useState({});
  const [moveHistory, setMoveHistory] = useState([]);
  const [botThinking, setBotThinking] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [difficulty, setDifficulty] = useState(5);
  const [gameStatus, setGameStatus] = useState('');

  // Initialize Stockfish engine
  useEffect(() => {
    const engine = new Worker('/stockfish/stockfish-17.js');
    engineRef.current = engine;

    engine.postMessage('uci');
    engine.postMessage(`setoption name Skill Level value ${difficulty}`);
    engine.postMessage('isready');

    engine.onmessage = (e) => {
      const line = e.data;
      if (line.startsWith('bestmove')) {
        const move = line.split(' ')[1];
        chessRef.current.move({
          from: move.slice(0, 2),
          to: move.slice(2, 4),
          promotion: 'q',
        });
        setMoveHistory([...chessRef.current.history()]);
        updateConfig();

        const status = evaluateGameStatus(chessRef.current);
        if (status) setGameStatus(status);

        setBotThinking(false);
      }

      if (line.includes('score cp')) {
        const match = line.match(/score cp (-?\d+)/);
        if (match) {
          setEvaluation((+match[1] / 100).toFixed(2));
        }
      }
    };

    return () => {
      engine.terminate();
    };
  }, [difficulty]);

  const getAllSquares = () => {
    const files = 'abcdefgh'.split('');
    const ranks = '12345678'.split('');
    const squares = [];
    files.forEach(f => {
      ranks.forEach(r => squares.push(f + r));
    });
    return squares;
  };

  const getDests = () => {
    const dests = new Map();
    const squares = getAllSquares();
    const chess = chessRef.current;

    squares.forEach((square) => {
      const moves = chess.moves({ square, verbose: true });
      if (moves.length) {
        dests.set(square, moves.map(m => m.to));
      }
    });

    return dests;
  };

  const updateConfig = () => {
    setConfig({
      fen: chessRef.current.fen(),
      orientation: playerSide,
      turnColor: chessRef.current.turn() === 'w' ? 'white' : 'black',
      movable: {
        color: playerSide,
        free: false,
        dests: getDests(),
      },
      events: {
        move: onPlayerMove,
      },
    });
  };

  const onPlayerMove = (from, to) => {
    const move = chessRef.current.move({ from, to, promotion: 'q' });
    if (move) {
      setMoveHistory([...chessRef.current.history()]);
      updateConfig();

      const status = evaluateGameStatus(chessRef.current);
      if (status) {
        setGameStatus(status);
        return;
      }

      setTimeout(makeBotMove, 100);
    }
  };

  const makeBotMove = () => {
    const chess = chessRef.current;
    const status = evaluateGameStatus(chess);
    if (status) {
      setGameStatus(status);
      return;
    }

    setBotThinking(true);
    const fen = chess.fen();
    engineRef.current.postMessage(`position fen ${fen}`);
    engineRef.current.postMessage('go depth 10');
  };

  useEffect(() => {
    updateConfig();
    if (playerSide === 'black') {
      setTimeout(makeBotMove, 500);
    }
  }, [playerSide]);

  return (
    <div style={{ background: '#262421', minHeight: '100vh' }}>
      <Header />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 20 }}>
        <h2 style={{ color: 'white', marginBottom: 20 }}>Play vs Bot</h2>

        {/* Controls */}
        <div style={{ marginBottom: 20, color: 'white' }}>
          <label>Side: </label>
          <select value={playerSide} onChange={e => setPlayerSide(e.target.value)}>
            <option value="white">White</option>
            <option value="black">Black</option>
          </select>
        </div>

        <div style={{ marginBottom: 20, color: 'white' }}>
          <label>Difficulty: </label>
          <input
            type="range"
            min="0"
            max="20"
            value={difficulty}
            onChange={e => setDifficulty(+e.target.value)}
          />
          <span style={{ marginLeft: 10 }}>{difficulty}</span>
        </div>

        {/* Status & Eval */}
        {evaluation && (
          <div style={{ color: '#4CAF50', marginBottom: 10 }}>
            Eval: {evaluation}
          </div>
        )}
        {botThinking && (
          <div style={{ color: '#FFD700', marginBottom: 10 }}>
            🤖 Bot is thinking...
          </div>
        )}
        {gameStatus && (
          <div style={{ color: 'lightgreen', marginBottom: 10 }}>
            {gameStatus}
          </div>
        )}

        {/* Chess Board */}
        <Chessground
          width={520}
          height={520}
          config={config}
          contained={false}
        />

        {/* Buttons */}
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => {
              chessRef.current.reset();
              setMoveHistory([]);
              setEvaluation(null);
              setGameStatus('');
              updateConfig();
              if (playerSide === 'black') {
                setTimeout(makeBotMove, 500);
              }
            }}
          >
            ♻ Reset Game
          </button>

          <button
            onClick={() => navigate('/')}
            style={{
              marginLeft: 20,
              background: 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              padding: '10px 20px',
              borderRadius: '25px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            🏠 Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default BotGame;
