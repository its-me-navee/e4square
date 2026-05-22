# E4Square

E4Square is a full-stack chess platform built around live multiplayer, bot play, and a puzzle trainer. It combines a responsive React chess interface with a Node.js real-time game server, Firebase authentication, Stockfish analysis, and a disk-backed puzzle database.

## Product

- Real-time online chess with lobby presence, friend games, clocks, resignations, reconnect handling, and abandonment outcomes.
- Bot games with takebacks, optional engine evaluation, and board arrows for analysis.
- Puzzle trainer with themed puzzle discovery, played-puzzle tracking, post-solve exploration, move-back support, and engine-assisted analysis.
- Board-first responsive UI designed for desktop and mobile chess workflows.

## Engineering Highlights

- Single-origin production app where Express serves the React build, API routes, Stockfish assets, and Socket.IO from one deployment.
- Firebase Auth on the client with Firebase Admin verification on the server for authenticated socket sessions.
- Socket.IO multiplayer lifecycle covering active-player presence, rematches, resignations, disconnects, reconnects, and game cleanup.
- SQLite puzzle repository opened read-only from disk, with bounded random sampling so large puzzle datasets are not loaded into memory.
- Streaming parquet-to-SQLite import pipeline for preparing large puzzle files without committing generated data.
- Stockfish worker lifecycle scoped to bot/eval usage so engine resources are started only when needed and terminated after use.

## Stack

React, chess.js, chessground/chessboard UI components, Socket.IO, Express, Firebase Auth, Firebase Admin, better-sqlite3, Stockfish WASM, and Docker.

## Architecture

```mermaid
flowchart LR
  player["Player browser<br/>React SPA"]
  firebase["Firebase Auth<br/>Client SDK and Admin verification"]
  stockfish["Stockfish WASM workers<br/>Bot play and analysis"]

  subgraph host["Production host"]
    nginx["Nginx TLS reverse proxy<br/>deploy/nginx/e4square.conf"]
    app["Node/Express app<br/>server/server.js"]
    static["React build and Stockfish assets<br/>server/client-build"]
    realtime["Socket.IO realtime layer<br/>presence, invites, rooms, clocks"]
    puzzleApi["Puzzle REST API<br/>server/routes/puzzles.js"]
    puzzleRepo["Puzzle repository<br/>better-sqlite3 read-only access"]
    puzzleDb[("server/data/puzzles.db")]
  end

  parquet[("Source puzzle parquet")]
  importer["Puzzle import pipeline<br/>scripts/import_puzzles.py"]

  player -->|HTTPS pages and REST| nginx
  player <-->|WebSocket events| nginx
  nginx --> app
  app -->|serves| static
  app --> realtime
  app --> puzzleApi
  player -->|sign in| firebase
  realtime -->|verify ID token| firebase
  player -->|loads engine assets| static
  player -->|runs locally| stockfish
  puzzleApi --> puzzleRepo
  puzzleRepo --> puzzleDb
  parquet --> importer
  importer --> puzzleDb
```

## Demo

<table>
  <tr>
    <td width="50%">
      <img src="https://github.com/user-attachments/assets/7fa54694-e2ad-44e4-8eef-d5e6fb23d501" />
    </td>
    <td width="50%">
      <img src="https://github.com/user-attachments/assets/8ec3720e-72be-4014-8789-1d9c938aceff" />
    </td>
  </tr>

  <tr>
    <td width="50%">
      <img src="https://github.com/user-attachments/assets/49a04419-8d5f-484f-96b4-e6f5dfee93e0" />
    </td>
    <td width="50%">
      <img src="https://github.com/user-attachments/assets/6770b987-4053-4ad2-8182-dbc0354263ce" />
    </td>
  </tr>

  <tr>
    <td colspan="2">
      <img src="https://github.com/user-attachments/assets/335982a8-bed8-4ff3-a4a7-c6706573f907" />
    </td>
  </tr>
</table>

## Repository Map

```text
client/                  React application and chess UI
client/public/stockfish  Browser Stockfish assets
server/                  Express API, Socket.IO server, Firebase Admin, puzzle API
server/data/             Local puzzle DB location, ignored by git
scripts/                 Puzzle import utilities
Dockerfile               Production container build
docker-compose.yml       Single-instance production app container
```
