# E4Square

E4Square is a full-stack chess app with Firebase login, Socket.IO multiplayer, bot play, and a puzzle trainer backed by a local SQLite puzzle database.

## Features

- Firebase Authentication for user login.
- Online lobby with active player presence.
- Friend games with Socket.IO, clocks, resignation, reconnect handling, and abandonment handling.
- Stockfish bot play with optional evaluation and board arrows.
- Puzzle trainer imported from a parquet puzzle file into SQLite.
- Single-origin production build: Express serves the React app, API routes, Stockfish assets, and Socket.IO.

## Project Structure

```text
client/                  React app
client/public/stockfish  Browser Stockfish WASM assets
server/                  Express, Socket.IO, Firebase Admin, puzzle API
server/data/             Local puzzle database location, ignored by git
scripts/                 Puzzle import utilities
Dockerfile               Container build for AWS or any Docker host
```

## Requirements

- Node.js 20 and npm.
- Firebase project with Authentication enabled.
- Firebase Admin service account for real multiplayer socket auth.
- Puzzle parquet file if you want `/puzzles` to work with your own data.
- Python 3 with `pandas` and `pyarrow` only when importing parquet into SQLite.

## Fresh Clone Setup

Install dependencies:

```bash
npm run install-all
```

Create a local server environment file. This file is ignored and must not be committed:

Use this shape:

```env
FIREBASE_PROJECT_ID=e4square-5ed72
FIREBASE_CLIENT_EMAIL=your-service-account-email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour Private Key\n-----END PRIVATE KEY-----\n"
PUZZLES_DB_PATH=./data/puzzles.db
ALLOW_GUEST_AUTH=false
PORT=5000
NODE_ENV=development
```

For temporary local multiplayer testing before Firebase Admin is configured, set `ALLOW_GUEST_AUTH=true`.


## Puzzle Database

After training the puzzles data in parquet

Import from parquet:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install pandas pyarrow
.venv/bin/python scripts/import_puzzles.py /path/to/puzzles.parquet --db server/data/puzzles.db
```

For a small test import:

```bash
.venv/bin/python scripts/import_puzzles.py /path/to/puzzles.parquet --db server/data/puzzles.db --limit 1000
```

## Run Locally

Development mode, server and client separately:

```bash
npm run dev
```

Server: `http://localhost:5000`

React dev server: `http://localhost:3000`

Production-like local mode, same origin:

```bash
npm run build
npm start
```

Open `http://localhost:5000`.

## Useful Scripts

```bash
npm run install-all   # install server and client dependencies
npm run dev           # run server and React dev server
npm run build         # build React and stage it into server/client-build
npm start             # start Express server
npm run clean:build   # remove generated frontend build output
npm run clean:local   # remove local dependency and Python env folders
```


## Troubleshooting

- `Failed to load puzzles`: `server/data/puzzles.db` is missing or `PUZZLES_DB_PATH` is wrong.
- Socket auth errors: Firebase Admin env vars are missing, malformed, or guest auth is disabled.
- Bot/eval uses CPU: engine workers start only when needed, but Stockfish is still compute-heavy while bot search or eval is active.
- AWS login fails: add the deployed AWS/custom domain to Firebase Authentication authorized domains.
