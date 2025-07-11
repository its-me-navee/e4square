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

app.use(express.static(path.join(__dirname, '../client/build')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {origin: "*"}
});

// 🧠 Game state manager
const games = {}; // roomId => { chess: ChessInstance, players: { white, black }, status }
const activePlayers = new Map(); // socketId => { email, name, status }
const pendingInvitations = new Map(); // invitationId => { from, to, roomId, timestamp }
const playerSockets = new Map(); // email => socketId

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
  
  // Map email to socket for easy lookup
  playerSockets.set(userEmail, socket.id);

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
    const targetSocketId = playerSockets.get(toEmail);

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
    const invitingSocketId = playerSockets.get(invitation.from);

    if (invitingSocketId) {
      if (accepted) {
        // Create game and assign players
        const game = {
          chess: new Chess(),
          players: {
            white: { email: invitation.from, socketId: invitingSocketId },
            black: { email: invitation.to, socketId: socket.id }
          },
          status: 'active',
          moves: []
        };
        games[invitation.roomId] = game;

        // Join both players to the room
        socket.join(invitation.roomId);
        io.sockets.sockets.get(invitingSocketId)?.join(invitation.roomId);

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

        // Send game state to both players
        const gameState = {
          fen: game.chess.fen(),
          turn: game.chess.turn() === 'w' ? 'white' : 'black',
          moves: game.moves
        };
        
        io.to(invitingSocketId).emit('game-state', gameState);
        socket.emit('game-state', gameState);

        console.log(`✅ Game started: ${invitation.from} vs ${invitation.to}`);
        console.log(`📋 Game state sent to both players:`, gameState);
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

  // Handle joining existing games
  socket.on('join-game', ({ gameId }) => {
    console.log(`🔍 Player ${userEmail} trying to join game ${gameId}`);
    const game = games[gameId];
    if (game) {
      console.log(`📋 Current game state:`, {
        white: game.players.white.email,
        black: game.players.black.email,
        status: game.status
      });
      
      // Game exists, assign player to available side
      let side = null;
      let opponent = null;
      
      if (!game.players.white.email) {
        side = 'white';
        game.players.white = { email: userEmail, socketId: socket.id };
        opponent = game.players.black.email ? activePlayers.get(game.players.black.socketId)?.name : null;
        console.log(`⚪ Assigned ${userEmail} as white`);
      } else if (!game.players.black.email) {
        side = 'black';
        game.players.black = { email: userEmail, socketId: socket.id };
        opponent = game.players.white.email ? activePlayers.get(game.players.white.socketId)?.name : null;
        console.log(`⚫ Assigned ${userEmail} as black`);
      } else {
        // Both sides taken, check if player is already in game
        if (game.players.white.email === userEmail) {
          side = 'white';
          opponent = activePlayers.get(game.players.black.socketId)?.name;
          console.log(`🔄 ${userEmail} already in game as white`);
        } else if (game.players.black.email === userEmail) {
          side = 'black';
          opponent = activePlayers.get(game.players.white.socketId)?.name;
          console.log(`🔄 ${userEmail} already in game as black`);
        } else {
          console.log(`❌ Game is full, ${userEmail} cannot join`);
        }
      }

      if (side) {
        socket.join(gameId);
        socket.emit('game-joined', {
          roomId: gameId,
          side: side,
          opponent: opponent
        });
        
        console.log(`✅ Player ${userEmail} joined game ${gameId} as ${side}`);
        
        // If both players are now in the game, update status and notify both
        if (game.players.white.email && game.players.black.email) {
          game.status = 'active';
          console.log(`🎮 Game ${gameId} is now active with both players`);
          
          // Notify other player that opponent joined
          const otherSide = side === 'white' ? 'black' : 'white';
          const otherSocketId = game.players[otherSide].socketId;
          if (otherSocketId && otherSocketId !== socket.id) {
            io.to(otherSocketId).emit('opponent-joined', {
              opponent: activePlayers.get(socket.id)?.name
            });
            console.log(`📢 Notified ${otherSocketId} that opponent joined`);
          }
          
          // Send current game state to the new player
          socket.emit('game-state', {
            fen: game.chess.fen(),
            turn: game.chess.turn() === 'w' ? 'white' : 'black',
            moves: game.moves
          });
          
          // Also send game state to the existing player to ensure sync
          if (otherSocketId) {
            io.to(otherSocketId).emit('game-state', {
              fen: game.chess.fen(),
              turn: game.chess.turn() === 'w' ? 'white' : 'black',
              moves: game.moves
            });
          }
        } else if (game.status === 'active') {
          // Game is already active, just send current state to the joining player
          console.log(`🔄 Player ${userEmail} joining already active game ${gameId}`);
          socket.emit('game-state', {
            fen: game.chess.fen(),
            turn: game.chess.turn() === 'w' ? 'white' : 'black',
            moves: game.moves
          });
        } else {
          console.log(`⏳ Game ${gameId} waiting for second player`);
        }
      } else {
        console.log(`❌ Could not assign side to ${userEmail}`);
        socket.emit('game-full', { message: 'Game is full' });
      }
    } else {
      // Game doesn't exist
      console.log(`❌ Game ${gameId} not found`);
      socket.emit('game-not-found');
    }
  });

  // Handle creating new games
  socket.on('create-game', ({ gameId }) => {
    console.log(`🎮 Creating new game ${gameId} by ${userEmail}`);
    
    const game = {
      chess: new Chess(),
      players: {
        white: { email: userEmail, socketId: socket.id },
        black: { email: null, socketId: null }
      },
      status: 'waiting',
      moves : []
    };
    games[gameId] = game;
    
    socket.join(gameId);
    socket.emit('game-joined', {
      roomId: gameId,
      side: 'white',
      opponent: null
    });
    
    console.log(`✅ New game created: ${gameId} by ${userEmail} as white`);
    console.log(`📋 Game state:`, {
      white: game.players.white.email,
      black: game.players.black.email,
      status: game.status
    });
  });

  // Listen for moves from clients
  socket.on('move', ({ move, gameId }) => {
    console.log('Received move:', move, 'for game:', gameId);
    
    const game = games[gameId];
    if (!game) {
      console.log('❌ Game not found:', gameId);
      return;
    }

    // Check if player is in this game
    const playerSide = game.players.white.email === userEmail ? 'white' : 
                      game.players.black.email === userEmail ? 'black' : null;
    
    if (!playerSide) {
      console.log('❌ Player not in game:', userEmail);
      return;
    }

    // Check if it's the player's turn
    const chess = game.chess;
    const currentTurn = chess.turn() === 'w' ? 'white' : 'black';
    
    if (currentTurn !== playerSide) {
      console.log(`❌ Not ${userEmail}'s turn. Current turn: ${currentTurn}`);
      socket.emit('invalid-move', { error: 'Not your turn' });
      return;
    }

    // Validate move
    try {
      const result = chess.move(move);
      if (result) {
        // Broadcast move to other players in the room
        game.moves.push({ move: result, fen: chess.fen() });
        socket.to(gameId).emit('opponent-move', { move: result });
        console.log(`✅ Move applied: ${result.from} -> ${result.to}`);
        
        // Check if game is over
        if (chess.isGameOver()) {
          const gameOverData = {
            isCheckmate: chess.isCheckmate(),
            isStalemate: chess.isStalemate(),
            isDraw: chess.isDraw(),
            winner: chess.isCheckmate() ? (chess.turn() === 'w' ? 'black' : 'white') : null
          };
          
          // Broadcast game over to all players in the room
          io.to(gameId).emit('game-over', gameOverData);
        }
      }
    } catch (error) {
      console.error('❌ Invalid move:', error);
      socket.emit('invalid-move', { error: error.message });
    }
  });
  socket.on('get-move-history', ({ gameId }) => {
    const game = games[gameId];
    if (game) {
      socket.emit('move-history', { moves: game.moves });
    } else {
      socket.emit('move-history', { error: 'Game not found' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // Remove from active players
    activePlayers.delete(socket.id);
    playerSockets.delete(userEmail);
    broadcastActivePlayers();

    // Clean up any pending invitations
    for (const [invitationId, invitation] of pendingInvitations.entries()) {
      if (invitation.from === userEmail || invitation.to === userEmail) {
        pendingInvitations.delete(invitationId);
      }
    }

    // Clean up games where this player was the only one
    for (const [gameId, game] of Object.entries(games)) {
      if (game.players.white.email === userEmail && !game.players.black.email) {
        delete games[gameId];
        console.log(`🗑️ Deleted empty game: ${gameId}`);
      } else if (game.players.black.email === userEmail && !game.players.white.email) {
        delete games[gameId];
        console.log(`🗑️ Deleted empty game: ${gameId}`);
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
