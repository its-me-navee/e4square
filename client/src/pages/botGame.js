import React, { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Chessground from '@react-chess/chessground';
import { useNavigate } from 'react-router-dom';

import Header from '../components/Header';
import { useBotUpdateConfig } from '../hooks/useBotUpdateConfig';
import { evaluateGameStatus } from '../utils/gameStatus';

import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

const isMobileDevice = () =>
  navigator.userAgentData?.mobile ?? /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const createStockfishWorker = async () => {
  const paths = isMobileDevice()
    ? ['/stockfish/stockfish-17-lite.js']
    : ['/stockfish/stockfish-17.js', '/stockfish/stockfish-17-lite.js'];

  for (const path of paths) {
    try {
      const worker = new Worker(path);
      return { worker, path };
    } catch (err) {
      console.warn(`[Stockfish] Failed to load ${path}:`, err);
    }
  }

  throw new Error('❌ Failed to load any Stockfish engine');
};

const BotGame = () => {
  const navigate = useNavigate();
  const chessRef = useRef(new Chess());
  const engineRef = useRef(null);

  const [playerSide, setPlayerSide] = useState('white');
  const [config, setConfig] = useState({});
  const [moveHistory, setMoveHistory] = useState([]);
  const [evaluation, setEvaluation] = useState(null);
  const [difficulty, setDifficulty] = useState(5);
  const [gameStatus, setGameStatus] = useState('');

  // Load engine
  useEffect(() => {
    let workerRef = null;

    createStockfishWorker()
      .then(({ worker, path }) => {
        console.log(`[Stockfish] Loaded engine from ${path}`);
        engineRef.current = worker;
        workerRef = worker;

        worker.postMessage('uci');
        worker.postMessage(`setoption name Skill Level value ${difficulty}`);
        worker.postMessage('isready');

        worker.onmessage = (e) => {
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

          }

          if (line.includes('score cp')) {
            const match = line.match(/score cp (-?\d+)/);
            if (match) {
              setEvaluation((+match[1] / 100).toFixed(2));
            }
          }
        };
      })
      .catch((err) => {
        console.error(err.message);
        alert('Could not load chess engine. Please try again later.');
      });

    return () => {
      workerRef?.terminate();
    };
  }, [difficulty]);

  const makeBotMove = () => {
    const chess = chessRef.current;
    const status = evaluateGameStatus(chess);
    if (status) {
      setGameStatus(status);
      return;
    }

    const fen = chess.fen();
    engineRef.current.postMessage(`position fen ${fen}`);
    engineRef.current.postMessage('go depth 10');
  };

  const updateConfig = useBotUpdateConfig({
    chessRef,
    playerSide,
    setConfig,
    setMoveHistory,
    setCurrentMoveIndex: () => {}, // Optional: implement if needed
    setGameStatus,
    onPlayerMove: () => setTimeout(makeBotMove, 100),
  });

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

        {evaluation && (
          <div style={{ color: '#4CAF50', marginBottom: 10 }}>
            Eval: {evaluation}
          </div>
        )}

        {gameStatus && (
          <div style={{ color: 'lightgreen', marginBottom: 10 }}>
            {gameStatus}
          </div>
        )}

        <Chessground
          width={520}
          height={520}
          config={config}
          contained={false}
        />

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
              fontSize: '14px',
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
