// src/socket.js
import { io } from 'socket.io-client';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

const socket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000', {
  autoConnect: false,
});

// Listen for Firebase login
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const token = await user.getIdToken();
      socket.auth = { token };
      if (!socket.connected) {
        socket.connect();
      }
    } catch (error) {
      console.error('Failed to get auth token:', error);
    }
  } else {
    if (socket.connected) {
      socket.disconnect();
    }
    console.warn("User not logged in, socket disconnected.");
  }
});

export default socket;
