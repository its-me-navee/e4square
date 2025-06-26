require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');
const cors = require('cors');
const admin = require('firebase-admin');
const path = require('path');


admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {origin: "*"}
});

// 🧠 Chess game state manager
const games = {}; // roomId => { chess: ChessInstance, players: { white, black } }

// 🔐 Socket.IO Auth Middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Missing token'));
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    socket.user = decoded;
    console.log('✅ Authenticated user:', decoded.email);
    next();
  } catch (err) {
    console.error('❌ Auth error:', err.message);
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Listen for moves from one client
  socket.on('move', (move) => {
        console.log('Received move:', move);
        // Broadcast to all other clients
        socket.broadcast.emit('opponent-move', move);
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
  });
});

app.get('/', (req, res) => {
    res.json({ message: 'E4Square Chess Server' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server is running on ${PORT}`);
});
