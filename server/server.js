const express = require('express');
const http = require('http');
const {Server} = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {origin: "*"}
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
