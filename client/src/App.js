import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import ChessBoard from './pages/ChessBoard';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Home from './pages/Home';
import BotGame from './pages/botGame';
import Puzzles from './pages/Puzzles';
import './styles.css';

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/', element: <Home /> },
  { path: '/settings', element: <Settings /> },
  { path: '/game/:gameId', element: <ChessBoard /> },
  { path: '/bot', element: <BotGame /> },
  { path: '/puzzles', element: <Puzzles /> },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
