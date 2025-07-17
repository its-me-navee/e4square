import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ChessBoard from './pages/ChessBoard';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Home from './pages/Home';
import BotGame from './pages/botGame';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Home />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/game/:gameId" element={<ChessBoard />} />
        <Route path="/bot" element={<BotGame />} />
      </Routes>
    </Router>
  );
}

export default App;