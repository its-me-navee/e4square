require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');
const cors = require('cors');
const admin = require('firebase-admin');
const path = require('path');
const puzzleRoutes = require('./routes/puzzles');

const firebaseAdminConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};
const hasFirebaseAdminConfig = Boolean(
  firebaseAdminConfig.projectId &&
  firebaseAdminConfig.clientEmail &&
  firebaseAdminConfig.privateKey
);

if (hasFirebaseAdminConfig) {
  admin.initializeApp({
    credential: admin.credential.cert(firebaseAdminConfig),
  });
} else {
  console.warn('Firebase Admin credentials are not configured. Socket auth will reject clients unless ALLOW_GUEST_AUTH=true.');
}

const app = express();
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

app.use(
  express.static(path.join(__dirname, "client-build"), {
    setHeaders: (res, filePath) => {
      res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      if (filePath.endsWith('.wasm')) {
        res.setHeader('Content-Type', 'application/wasm');
      }
    },
  })
);
app.use(express.static(path.join(__dirname, 'client-build')));

// Health check endpoint for AWS load balancers and container platforms.
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// API status endpoint
app.get('/api/status', (req, res) => {
  res.json({ 
    message: 'E4Square Chess Server',
    version: '1.0.0',
    activeGames: Object.keys(games).length,
    activePlayers: activePlayers.size,
    environment: process.env.NODE_ENV || 'development'
  });
});

app.use('/api/puzzles', puzzleRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client-build', 'index.html'));
});

const DEFAULT_CLOCK_MS = Number(process.env.GAME_CLOCK_MS || 10 * 60 * 1000);
const ABANDONMENT_GRACE_MS = Number(process.env.ABANDONMENT_GRACE_MS || 15 * 1000);
const GAME_CLEANUP_MS = Number(process.env.GAME_CLEANUP_MS || 2 * 60 * 1000);
const CLOCK_TICK_MS = 1000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  pingInterval: 25000,
  pingTimeout: 20000,
  connectTimeout: 30000,
  connectionStateRecovery: {
    maxDisconnectionDuration: ABANDONMENT_GRACE_MS,
    skipMiddlewares: false
  }
});

// 🧠 Game state manager
const games = {}; // roomId => { chess: ChessInstance, players: { white, black }, status }
const activePlayers = new Map(); // socketId => { email, name, status }
const pendingInvitations = new Map(); // invitationId => { from, to, roomId, timestamp }
const playerSockets = new Map(); // email => Set<socketId>

function addPlayerSocket(email, socketId) {
  if (!playerSockets.has(email)) {
    playerSockets.set(email, new Set());
  }
  playerSockets.get(email).add(socketId);
}

function removePlayerSocket(email, socketId) {
  const sockets = playerSockets.get(email);
  if (!sockets) return;

  sockets.delete(socketId);
  if (sockets.size === 0) {
    playerSockets.delete(email);
  }
}

function getPlayerSocket(email) {
  const sockets = playerSockets.get(email);
  return sockets ? sockets.values().next().value : null;
}

function getPlayerSockets(email) {
  return Array.from(playerSockets.get(email) || []);
}

function buildActivePlayersList() {
  const byEmail = new Map();

  for (const player of activePlayers.values()) {
    if (!player.email) continue;

    const existing = byEmail.get(player.email);
    if (existing) {
      existing.connections += 1;
      if (player.lastSeen > existing.lastSeen) {
        existing.lastSeen = player.lastSeen;
      }
      continue;
    }

    byEmail.set(player.email, {
      email: player.email,
      name: player.name,
      status: player.status,
      socketId: getPlayerSocket(player.email) || player.socketId,
      sessionId: player.sessionId,
      connections: 1,
      lastSeen: player.lastSeen
    });
  }

  return Array.from(byEmail.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function createPlayer(email, socketId) {
  return {
    email,
    socketId,
    connected: Boolean(socketId),
    disconnectedAt: null,
    abandonmentDeadline: null
  };
}

function createGame({ whiteEmail, whiteSocketId, blackEmail = null, blackSocketId = null, status = 'waiting' }) {
  return {
    chess: new Chess(),
    players: {
      white: createPlayer(whiteEmail, whiteSocketId),
      black: createPlayer(blackEmail, blackSocketId)
    },
    status,
    result: null,
    moves: [],
    clocks: {
      white: DEFAULT_CLOCK_MS,
      black: DEFAULT_CLOCK_MS
    },
    lastClockUpdate: Date.now(),
    abandonmentTimers: {},
    cleanupTimer: null
  };
}

function getTurnSide(game) {
  return game.chess.turn() === 'w' ? 'white' : 'black';
}

function getPlayerSide(game, socketId) {
  if (game.players.white.socketId === socketId) return 'white';
  if (game.players.black.socketId === socketId) return 'black';
  return null;
}

function getOpponentSide(side) {
  return side === 'white' ? 'black' : 'white';
}

function getPlayerName(socketId, email) {
  return activePlayers.get(socketId)?.name || email?.split('@')[0] || 'Opponent';
}

function clearAbandonmentTimer(game, side) {
  if (game.abandonmentTimers?.[side]) {
    clearTimeout(game.abandonmentTimers[side]);
    delete game.abandonmentTimers[side];
  }
}

function markPlayerConnected(game, side, socketId) {
  const player = game.players[side];
  clearAbandonmentTimer(game, side);
  player.socketId = socketId;
  player.connected = true;
  player.disconnectedAt = null;
  player.abandonmentDeadline = null;
}

function markPlayerDisconnected(game, side) {
  const player = game.players[side];
  player.connected = false;
  player.disconnectedAt = Date.now();
  player.abandonmentDeadline = player.disconnectedAt + ABANDONMENT_GRACE_MS;
}

function buildGameState(game) {
  return {
    fen: game.chess.fen(),
    turn: getTurnSide(game),
    moves: game.moves,
    status: game.status,
    result: game.result,
    clocks: game.clocks,
    players: {
      white: {
        connected: game.players.white.connected,
        name: getPlayerName(game.players.white.socketId, game.players.white.email)
      },
      black: {
        connected: game.players.black.connected,
        name: getPlayerName(game.players.black.socketId, game.players.black.email)
      }
    },
    disconnected: ['white', 'black']
      .filter((side) => game.players[side].email && !game.players[side].connected)
      .map((side) => ({
        side,
        abandonmentDeadline: game.players[side].abandonmentDeadline
      }))
  };
}

function getResultMessage(winner, reason) {
  const winnerLabel = winner ? `${winner.charAt(0).toUpperCase()}${winner.slice(1)}` : null;
  if (reason === 'checkmate') return `${winnerLabel} won by checkmate`;
  if (reason === 'timeout') return `${winnerLabel} won on time`;
  if (reason === 'resignation') return `${winnerLabel} won by resignation`;
  if (reason === 'abandonment') return `${winnerLabel} won by abandonment`;
  if (reason === 'stalemate') return 'Draw by stalemate';
  if (reason === 'draw') return 'Draw';
  return winnerLabel ? `${winnerLabel} won` : 'Game over';
}

function completeGame(gameId, winner, reason) {
  const game = games[gameId];
  if (!game || game.status === 'completed') return;

  game.status = 'completed';
  game.result = {
    winner,
    reason,
    message: getResultMessage(winner, reason),
    endedAt: Date.now()
  };

  clearAbandonmentTimer(game, 'white');
  clearAbandonmentTimer(game, 'black');
  if (game.cleanupTimer) clearTimeout(game.cleanupTimer);

  game.cleanupTimer = setTimeout(() => {
    const currentGame = games[gameId];
    if (currentGame?.status === 'completed' && currentGame.result?.endedAt === game.result.endedAt) {
      delete games[gameId];
      console.log(`Cleaned completed game: ${gameId}`);
    }
  }, GAME_CLEANUP_MS);

  const state = buildGameState(game);
  io.to(gameId).emit('game-over', game.result);
  io.to(gameId).emit('game-state', state);
}

function updateClock(gameId) {
  const game = games[gameId];
  if (!game || game.status !== 'active' || game.result) return false;
  if (!game.players.white.email || !game.players.black.email) return false;

  const now = Date.now();
  const turnSide = getTurnSide(game);
  const elapsed = Math.max(0, now - game.lastClockUpdate);
  game.clocks[turnSide] = Math.max(0, game.clocks[turnSide] - elapsed);
  game.lastClockUpdate = now;

  if (game.clocks[turnSide] <= 0) {
    completeGame(gameId, getOpponentSide(turnSide), 'timeout');
    return true;
  }

  return false;
}

function broadcastGameState(gameId) {
  const game = games[gameId];
  if (!game) return;
  io.to(gameId).emit('game-state', buildGameState(game));
}

function broadcastClock(gameId) {
  const game = games[gameId];
  if (!game) return;
  io.to(gameId).emit('clock-update', {
    clocks: game.clocks,
    turn: getTurnSide(game),
    status: game.status,
    result: game.result
  });
}

function scheduleAbandonment(gameId, side) {
  const game = games[gameId];
  if (!game || game.status !== 'active') return;

  clearAbandonmentTimer(game, side);
  game.abandonmentTimers[side] = setTimeout(() => {
    const currentGame = games[gameId];
    if (!currentGame || currentGame.status !== 'active') return;
    if (!currentGame.players[side].connected) {
      completeGame(gameId, getOpponentSide(side), 'abandonment');
    }
  }, ABANDONMENT_GRACE_MS);
}

function beginPlayerAbsence(gameId, side, socket) {
  const game = games[gameId];
  if (!game || game.status !== 'active') return;
  if (!game.players[side].connected) return;

  updateClock(gameId);
  markPlayerDisconnected(game, side);
  socket.to(gameId).emit('opponent-disconnected', {
    side,
    abandonmentDeadline: game.players[side].abandonmentDeadline
  });
  broadcastGameState(gameId);
  scheduleAbandonment(gameId, side);
}

function syncActiveGameClock(gameId) {
  const expired = updateClock(gameId);
  if (!expired) broadcastClock(gameId);
}

// 🔐 Socket.IO Auth Middleware
io.use(async (socket, next) => {
  if (!hasFirebaseAdminConfig) {
    if (process.env.ALLOW_GUEST_AUTH === 'true') {
      socket.user = { email: `guest_${socket.id}@e4square.local` };
      return next();
    }

    return next(new Error('Firebase Admin credentials are not configured'));
  }

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
  // socket.user = { email: `guest_${socket.id}@e4square.test` };
  // console.log('🔓 Skipped auth, mocked user:', socket.user.email);
  // next();
});

io.on('connection', (socket) => {
  const userEmail = socket.user?.email;
  console.log(`User connected: ${socket.id} (${userEmail})`);

  // Add player to active players list
  activePlayers.set(socket.id, {
    email: userEmail,
    name: userEmail.split('@')[0], // Use email prefix as name
    status: 'online',
    socketId: socket.id,
    sessionId: socket.handshake.auth?.sessionId || socket.id,
    lastSeen: Date.now()
  });
  
  // Map email to socket for easy lookup
  addPlayerSocket(userEmail, socket.id);

  // Broadcast updated player list
  broadcastActivePlayers();

  // Send current active players to the new user
  socket.emit('active-players', buildActivePlayersList());

  // Handle player status updates
  socket.on('update-status', (status) => {
    const player = activePlayers.get(socket.id);
    if (player) {
      player.status = status;
      broadcastActivePlayers();
    }
  });

  socket.on('request-active-players', () => {
    socket.emit('active-players', buildActivePlayersList());
  });

  // Handle game invitations
  socket.on('send-invitation', ({ toEmail, toSocketId, roomId }) => {
    const fromPlayer = activePlayers.get(socket.id);
    if (!fromPlayer) return;

    const socketsForEmail = getPlayerSockets(toEmail);
    const targetSocketIds = socketsForEmail.length > 0
      ? socketsForEmail
      : (activePlayers.has(toSocketId) ? [toSocketId] : []);

    if (targetSocketIds.length > 0) {
      const primaryTargetSocketId = targetSocketIds[0];
      const targetPlayer = activePlayers.get(primaryTargetSocketId);
      const invitationId = `${socket.id}-${primaryTargetSocketId}-${Date.now()}`;
      pendingInvitations.set(invitationId, {
        from: fromPlayer.email,
        fromSocketId: socket.id,
        to: targetPlayer?.email || toEmail,
        toSocketIds: targetSocketIds,
        roomId,
        timestamp: Date.now()
      });

      // Send invitation to target player
      targetSocketIds.forEach((targetSocketId) => io.to(targetSocketId).emit('game-invitation', {
        invitationId,
        from: fromPlayer.email,
        fromName: fromPlayer.name,
        roomId
      }));

      console.log(`🎮 Invitation sent from ${fromPlayer.email} to ${toEmail}`);
    }
  });

  // Handle invitation responses
  socket.on('respond-invitation', ({ invitationId, accepted }) => {
    const invitation = pendingInvitations.get(invitationId);
    if (!invitation) return;

    const respondingPlayer = activePlayers.get(socket.id);
    if (!respondingPlayer) return;
    if (Array.isArray(invitation.toSocketIds) && !invitation.toSocketIds.includes(socket.id)) return;
    if (!invitation.toSocketIds && respondingPlayer.email !== invitation.to) return;

    // Find the inviting player's socket
    const invitingSocketId = activePlayers.has(invitation.fromSocketId)
      ? invitation.fromSocketId
      : getPlayerSocket(invitation.from);

    if (invitingSocketId) {
      if (accepted) {
        // Create game and assign players
        const game = createGame({
          whiteEmail: invitation.from,
          whiteSocketId: invitingSocketId,
          blackEmail: invitation.to,
          blackSocketId: socket.id,
          status: 'active'
        });
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
        const gameState = buildGameState(game);
        
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

      const targetSocketIds = Array.isArray(invitation.toSocketIds) ? invitation.toSocketIds : [];
      targetSocketIds
        .filter((targetSocketId) => targetSocketId !== socket.id)
        .forEach((targetSocketId) => io.to(targetSocketId).emit('invitation-cancelled', { invitationId }));
    }

    // Clean up invitation
    pendingInvitations.delete(invitationId);
  });

  // Handle joining existing games
  socket.on('join-game', ({ gameId }) => {
    console.log(`Player ${userEmail} trying to join game ${gameId}`);
    const game = games[gameId];
    if (!game) {
      socket.emit('game-not-found');
      return;
    }

    let side = getPlayerSide(game, socket.id);
    let wasDisconnected = false;

    if (!side) {
      side = ['white', 'black'].find((candidate) => (
        game.players[candidate].email === userEmail &&
        !game.players[candidate].connected
      ));
      wasDisconnected = Boolean(side);
    }

    if (!side) {
      side = ['white', 'black'].find((candidate) => !game.players[candidate].email);
      if (side) {
        game.players[side] = createPlayer(userEmail, socket.id);
      }
    }

    if (!side) {
      socket.emit('game-full', { message: 'Game is full' });
      return;
    }

    markPlayerConnected(game, side, socket.id);
    socket.join(gameId);

    if (game.players.white.email && game.players.black.email && game.status === 'waiting') {
      game.status = 'active';
      game.lastClockUpdate = Date.now();
    }

    const opponentSide = getOpponentSide(side);
    const opponent = game.players[opponentSide].email
      ? getPlayerName(game.players[opponentSide].socketId, game.players[opponentSide].email)
      : null;

    socket.emit('game-joined', {
      roomId: gameId,
      side,
      opponent,
      status: game.status,
      clocks: game.clocks,
      result: game.result
    });

    if (wasDisconnected) {
      socket.to(gameId).emit('opponent-reconnected', { side });
    } else if (game.players.white.email && game.players.black.email) {
      socket.to(gameId).emit('opponent-joined', {
        opponent: getPlayerName(socket.id, userEmail)
      });
    }

    broadcastGameState(gameId);
  });

  // Handle creating new games
  socket.on('create-game', ({ gameId }) => {
    console.log(`🎮 Creating new game ${gameId} by ${userEmail}`);
    
    const game = createGame({
      whiteEmail: userEmail,
      whiteSocketId: socket.id,
      status: 'waiting'
    });
    games[gameId] = game;
    
    socket.join(gameId);
    socket.emit('game-joined', {
      roomId: gameId,
      side: 'white',
      opponent: null,
      status: game.status,
      clocks: game.clocks,
      result: game.result
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

    if (game.status !== 'active') {
      socket.emit('invalid-move', { error: 'Game is not active' });
      return;
    }

    if (updateClock(gameId)) {
      return;
    }

    // Check if player is in this game
    const playerSide = game.players.white.socketId === socket.id ? 'white' :
                      game.players.black.socketId === socket.id ? 'black' : null;
    
    if (!playerSide) {
      console.log('❌ Player not in game:', userEmail);
      return;
    }

    if (!game.players[playerSide].connected) {
      socket.emit('invalid-move', { error: 'You are no longer seated in this game' });
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
        game.lastClockUpdate = Date.now();
        socket.emit('move-confirmed', { move: result, clocks: game.clocks });
        socket.to(gameId).emit('opponent-move', { move: result, clocks: game.clocks });
        console.log(`✅ Move applied: ${result.from} -> ${result.to}`);
        
        // Check if game is over
        if (chess.isGameOver()) {
          if (chess.isCheckmate()) {
            completeGame(gameId, chess.turn() === 'w' ? 'black' : 'white', 'checkmate');
          } else if (chess.isStalemate()) {
            completeGame(gameId, null, 'stalemate');
          } else {
            completeGame(gameId, null, 'draw');
          }
        } else {
          broadcastClock(gameId);
        }
      }
    } catch (error) {
      console.error('❌ Invalid move:', error);
      socket.emit('invalid-move', { error: error.message });
    }
  });

  socket.on('resign-game', ({ gameId }) => {
    const game = games[gameId];
    if (!game) return;

    const playerSide = getPlayerSide(game, socket.id);
    if (!playerSide || game.status !== 'active') return;

    updateClock(gameId);
    completeGame(gameId, getOpponentSide(playerSide), 'resignation');
  });

  socket.on('leave-game-screen', ({ gameId }) => {
    const game = games[gameId];
    if (!game) return;

    const playerSide = getPlayerSide(game, socket.id);
    if (!playerSide) return;

    beginPlayerAbsence(gameId, playerSide, socket);
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
    removePlayerSocket(userEmail, socket.id);
    broadcastActivePlayers();

    // Clean up any pending invitations tied to this exact browser tab
    for (const [invitationId, invitation] of pendingInvitations.entries()) {
      if (invitation.fromSocketId === socket.id) {
        pendingInvitations.delete(invitationId);
        continue;
      }

      if (Array.isArray(invitation.toSocketIds) && invitation.toSocketIds.includes(socket.id)) {
        invitation.toSocketIds = invitation.toSocketIds.filter((targetSocketId) => targetSocketId !== socket.id);
        if (invitation.toSocketIds.length === 0) {
          pendingInvitations.delete(invitationId);
        }
      }
    }

    // Active games get a short reconnection grace period, then the
    // disconnected player loses by abandonment.
    for (const [gameId, game] of Object.entries(games)) {
      const side = getPlayerSide(game, socket.id);
      if (!side) continue;

      if (game.status === 'active') {
        beginPlayerAbsence(gameId, side, socket);
        continue;
      }

      if (game.status === 'waiting') {
        delete games[gameId];
        console.log(`Deleted waiting game: ${gameId}`);
      }
    }
  });
});


function broadcastActivePlayers() {
  io.emit('active-players', buildActivePlayersList());
}

setInterval(() => {
  for (const gameId of Object.keys(games)) {
    const game = games[gameId];
    if (game?.status === 'active') {
      syncActiveGameClock(gameId);
    }
  }
}, CLOCK_TICK_MS);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server is running on ${PORT}`);
});
