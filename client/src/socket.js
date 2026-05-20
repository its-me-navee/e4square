// src/socket.js
import { io } from 'socket.io-client';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const socketUrl = (
  isLocalHost
    ? (window.location.port === '3000' ? 'http://localhost:5000' : '')
    : (process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL || '')
).replace(/\/+$/, '');

const socket = io(socketUrl || undefined, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 800,
  reconnectionDelayMax: 8000,
  randomizationFactor: 0.45,
  timeout: 20000,
});

const getSessionId = () => {
  const key = 'e4square-session-id';
  let sessionId = localStorage.getItem(key);
  if (!sessionId) {
    sessionId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(key, sessionId);
  }
  return sessionId;
};

let currentUser = null;
let tokenRequest = null;
let authResolved = false;
let connectionWanted = true;
let authWaiters = [];

const resolveAuthWaiters = () => {
  authWaiters.forEach((resolve) => resolve(currentUser));
  authWaiters = [];
};

const waitForAuth = () => {
  if (authResolved) return Promise.resolve(currentUser);

  return new Promise((resolve) => {
    authWaiters.push(resolve);
  });
};

const setSocketToken = async (forceRefresh = false) => {
  if (!currentUser) return null;

  if (!tokenRequest) {
    tokenRequest = currentUser
      .getIdToken(forceRefresh)
      .then((token) => {
        socket.auth = { token, sessionId: getSessionId() };
        return token;
      })
      .finally(() => {
        tokenRequest = null;
      });
  }

  return tokenRequest;
};

export const connectSocket = async ({ forceRefresh = false, remember = true } = {}) => {
  if (remember) connectionWanted = true;

  if (!authResolved) {
    await waitForAuth();
  }

  if (!currentUser || navigator.onLine === false) return false;

  try {
    await setSocketToken(forceRefresh);
    if (!socket.connected) {
      socket.connect();
    }
    return true;
  } catch (error) {
    console.error('Failed to prepare socket auth:', error);
    return false;
  }
};

export const disconnectSocket = ({ forget = true } = {}) => {
  if (forget) connectionWanted = false;
  if (socket.connected || socket.active) {
    socket.disconnect();
  }
};

socket.io.on('reconnect_attempt', () => {
  if (!connectionWanted) return;

  setSocketToken(true).catch((error) => {
    console.warn('Socket token refresh before reconnect failed:', error);
  });
});

socket.on('connect_error', (error) => {
  const authError = /auth|token|unauthorized|missing/i.test(error?.message || '');
  if (authError && connectionWanted) {
    connectSocket({ forceRefresh: true });
  }
});

socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect' && currentUser && connectionWanted) {
    window.setTimeout(() => connectSocket({ forceRefresh: true }), 1000);
  }
});

window.addEventListener('online', () => {
  if (connectionWanted) {
    connectSocket({ forceRefresh: true });
  }
});

// Listen for Firebase login
onAuthStateChanged(auth, async (user) => {
  authResolved = true;
  if (user) {
    currentUser = user;
    resolveAuthWaiters();
    connectSocket();
  } else {
    currentUser = null;
    resolveAuthWaiters();
    socket.auth = {};
    disconnectSocket();
    console.warn("User not logged in, socket disconnected.");
  }
});

export default socket;
