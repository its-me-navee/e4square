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
  const [boardSize, setBoardSize] = useState(520);
  const [gameStarted, setGameStarted] = useState(false);
  const [showBoard, setShowBoard] = useState(false);

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

  const startGame = () => {
    setShowBoard(true);
    setGameStarted(true);
    updateConfig();
    if (playerSide === 'black') {
      setTimeout(makeBotMove, 500);
    }
  };

  const updateConfig = useBotUpdateConfig({
    chessRef,
    playerSide,
    setConfig,
    setMoveHistory,
    setCurrentMoveIndex: () => {}, // Optional: implement if needed
    setGameStatus,
    onPlayerMove: () => {
      setGameStarted(true);
      setTimeout(makeBotMove, 100);
    },
  });

  useEffect(() => {
    updateConfig();
    if (playerSide === 'black') {
      setGameStarted(true);
      setTimeout(makeBotMove, 500);
    }
  }, [playerSide]);

  // Handle responsive board sizing
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 480) {
        setBoardSize(280);
      } else if (window.innerWidth <= 768) {
        setBoardSize(320);
      } else {
        setBoardSize(520);
      }
    };

    handleResize(); // Set initial size
    window.addEventListener('resize', handleResize);
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="bot-game-container">
      <Header />

      <div className="bot-game-content">
        <h2 className="bot-game-title">Play vs Bot</h2>

        {/* Controls - Only show before game starts */}
        {!gameStarted && (
          <>
            <div className="bot-controls">
              <label>Side: </label>
              <select value={playerSide} onChange={e => setPlayerSide(e.target.value)}>
                <option value="white">White</option>
                <option value="black">Black</option>
              </select>
            </div>

            <div className="bot-controls">
              <label>Difficulty: </label>
              <input
                type="range"
                min="0"
                max="20"
                value={difficulty}
                onChange={e => setDifficulty(+e.target.value)}
              />
              <span>{difficulty}</span>
            </div>

            {/* Start Button */}
            <button
              onClick={startGame}
              className="start-game-button"
            >
              🚀 Start Game
            </button>
          </>
        )}

        {/* Game Status - Only show during game */}
        {gameStarted && (
          <>
            {evaluation && (
              <div className="evaluation">
                Eval: {evaluation}
              </div>
            )}

            {gameStatus && (
              <div className="game-status">
                {gameStatus}
              </div>
            )}
          </>
        )}

        {/* Chess Board - Only show after starting */}
        {showBoard && (
          <Chessground
            width={boardSize}
            height={boardSize}
            config={config}
            contained={false}
          />
        )}

        <div className="bot-game-buttons">
          <button
            onClick={() => {
              chessRef.current.reset();
              setMoveHistory([]);
              setEvaluation(null);
              setGameStatus('');
              setGameStarted(false);
              setShowBoard(false);
              updateConfig();
            }}
          >
            ♻ Reset Game
          </button>

          <button
            onClick={() => navigate('/')}
            className="home-button"
          >
            🏠 Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default BotGame;
