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

// 🧠 Game state manager
const games = {}; // roomId => { chess: ChessInstance, players: { white, black } }
const activePlayers = new Map(); // socketId => { email, name, status }
const pendingInvitations = new Map(); // invitationId => { from, to, roomId, timestamp }

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
  const userEmail = socket.user?.email;
  console.log(`User connected: ${socket.id} (${userEmail})`);

  // Add player to active players list
  activePlayers.set(socket.id, {
    email: userEmail,
    name: userEmail.split('@')[0], // Use email prefix as name
    status: 'online',
    socketId: socket.id
  });

  // Broadcast updated player list
  broadcastActivePlayers();

  // Send current active players to the new user
  socket.emit('active-players', Array.from(activePlayers.values()));

  // Handle player status updates
  socket.on('update-status', (status) => {
    const player = activePlayers.get(socket.id);
    if (player) {
      player.status = status;
      broadcastActivePlayers();
    }
  });

  // Handle game invitations
  socket.on('send-invitation', ({ toEmail, roomId }) => {
    const fromPlayer = activePlayers.get(socket.id);
    if (!fromPlayer) return;

    // Find the target player's socket
    const targetSocketId = Array.from(activePlayers.entries())
      .find(([_, player]) => player.email === toEmail)?.[0];

    if (targetSocketId) {
      const invitationId = `${fromPlayer.email}-${toEmail}-${Date.now()}`;
      pendingInvitations.set(invitationId, {
        from: fromPlayer.email,
        to: toEmail,
        roomId,
        timestamp: Date.now()
      });

      // Send invitation to target player
      io.to(targetSocketId).emit('game-invitation', {
        invitationId,
        from: fromPlayer.email,
        fromName: fromPlayer.name,
        roomId
      });

      console.log(`🎮 Invitation sent from ${fromPlayer.email} to ${toEmail}`);
    }
  });

  // Handle invitation responses
  socket.on('respond-invitation', ({ invitationId, accepted }) => {
    const invitation = pendingInvitations.get(invitationId);
    if (!invitation) return;

    const respondingPlayer = activePlayers.get(socket.id);
    if (respondingPlayer.email !== invitation.to) return;

    // Find the inviting player's socket
    const invitingSocketId = Array.from(activePlayers.entries())
      .find(([_, player]) => player.email === invitation.from)?.[0];

    if (invitingSocketId) {
      if (accepted) {
        // Create game and assign players
        const game = {
          chess: new Chess(),
          players: {
            white: { email: invitation.from, socketId: invitingSocketId },
            black: { email: invitation.to, socketId: socket.id }
          }
        };
        games[invitation.roomId] = game;

        // Notify both players
        io.to(invitingSocketId).emit('invitation-accepted', {
          roomId: invitation.roomId,
          side: 'white',
          opponent: respondingPlayer.name
        });
        socket.emit('invitation-accepted', {
          roomId: invitation.roomId,
          side: 'black',
          opponent: activePlayers.get(invitingSocketId).name
        });

        console.log(`✅ Game started: ${invitation.from} vs ${invitation.to}`);
      } else {
        // Notify inviting player that invitation was declined
        io.to(invitingSocketId).emit('invitation-declined', {
          from: respondingPlayer.email
        });
      }
    }

    // Clean up invitation
    pendingInvitations.delete(invitationId);
  });

  // Listen for moves from one client
  socket.on('move', (move) => {
    console.log('Received move:', move);
    // Broadcast to all other clients
    socket.broadcast.emit('opponent-move', move);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // Remove from active players
    activePlayers.delete(socket.id);
    broadcastActivePlayers();

    // Clean up any pending invitations
    for (const [invitationId, invitation] of pendingInvitations.entries()) {
      if (invitation.from === userEmail || invitation.to === userEmail) {
        pendingInvitations.delete(invitationId);
      }
    }
  });
});

// Helper function to broadcast active players list
function broadcastActivePlayers() {
  const playersList = Array.from(activePlayers.values());
  io.emit('active-players', playersList);
}

app.get('/', (req, res) => {
  res.json({ message: 'E4Square Chess Server' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on ${PORT}`);
});
