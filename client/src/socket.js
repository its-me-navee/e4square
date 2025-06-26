// src/socket.js
import { io } from 'socket.io-client';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

const socket = io('http://localhost:5000', {
  autoConnect: false,
});

// Listen for Firebase login
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const token = await user.getIdToken();
    socket.auth = { token };
    socket.connect();
  } else {
    console.warn("User not logged in, socket not connected.");
  }
});

export default socket;
