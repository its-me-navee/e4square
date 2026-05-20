const fs = require('fs');
const path = require('path');

let Database = null;
let sqliteLoadError = null;

try {
  Database = require('better-sqlite3');
} catch (error) {
  sqliteLoadError = error;
}

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'puzzles.db');
const dbPath = process.env.PUZZLES_DB_PATH || DEFAULT_DB_PATH;

let db = null;

class PuzzleDatabaseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PuzzleDatabaseError';
  }
}

function getDb() {
  if (!Database) {
    throw new PuzzleDatabaseError(
      `Missing better-sqlite3 dependency. Run npm install in e4square/server. Original error: ${sqliteLoadError?.message || 'unknown'}`
    );
  }

  if (!fs.existsSync(dbPath)) {
    throw new PuzzleDatabaseError(
      `Puzzle database not found at ${dbPath}. Import the parquet file with scripts/import_puzzles.py first.`
    );
  }

  if (!db) {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  }

  return db;
}

function getReadiness() {
  return {
    ready: Boolean(Database && fs.existsSync(dbPath)),
    dbPath,
    missingDependency: !Database,
    missingDatabase: !fs.existsSync(dbPath),
  };
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];

  if (typeof value !== 'string') return [String(value)];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    if (parsed == null) return [];
    return [String(parsed)];
  } catch {
    return value
      .split(/[,\s]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
}

function rowToPuzzle(row) {
  if (!row) return null;

  return {
    id: row.id,
    puzzle_id: row.id,
    fen: row.fen,
    moves: parseJsonArray(row.moves),
    rating: Number(row.rating || 0),
    themes: parseJsonArray(row.themes),
  };
}

function clampLimit(rawLimit, fallback = 15, max = 50) {
  const value = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(value, max);
}

function getPuzzleById(id) {
  const row = getDb()
    .prepare('SELECT id, fen, moves, rating, themes FROM puzzles WHERE id = ?')
    .get(id);
  return rowToPuzzle(row);
}

function getDiversePuzzles({ limit = 15, maxRating = 2100 } = {}) {
  const db = getDb();
  const safeLimit = clampLimit(limit);
  const safeMaxRating = Number.parseInt(maxRating, 10) || 2100;
  const sampleSize = Math.min(safeLimit * 4, 200);

  const rows = db
    .prepare(
      `SELECT id, fen, moves, rating, themes
       FROM puzzles
       WHERE rating >= 0 AND rating <= ?
       ORDER BY RANDOM()
       LIMIT ?`
    )
    .all(safeMaxRating, sampleSize);

  const selected = [];
  const seenThemes = new Set();

  for (const row of rows) {
    const themes = parseJsonArray(row.themes);
    const primaryTheme = themes[0] || 'Other';

    if (!seenThemes.has(primaryTheme)) {
      seenThemes.add(primaryTheme);
      selected.push(row);
    }

    if (selected.length >= safeLimit) break;
  }

  if (selected.length < safeLimit) {
    const selectedIds = new Set(selected.map((row) => row.id));
    for (const row of rows) {
      if (!selectedIds.has(row.id)) {
        selected.push(row);
      }
      if (selected.length >= safeLimit) break;
    }
  }

  return selected.slice(0, safeLimit).map(rowToPuzzle);
}

function getSimilarPuzzles(id, { limit = 15, maxRating = 3000 } = {}) {
  const db = getDb();
  const safeLimit = clampLimit(limit);
  const safeMaxRating = Number.parseInt(maxRating, 10) || 3000;

  const source = db
    .prepare('SELECT id, fen, moves, rating, themes, similar_puzzles FROM puzzles WHERE id = ?')
    .get(id);

  if (!source) return { found: false, results: [] };

  const similarIds = parseJsonArray(source.similar_puzzles).slice(0, safeLimit * 2);

  if (similarIds.length > 0) {
    const placeholders = similarIds.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT id, fen, moves, rating, themes
         FROM puzzles
         WHERE id IN (${placeholders}) AND rating <= ?`
      )
      .all(...similarIds, safeMaxRating);

    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered = similarIds
      .map((similarId) => byId.get(similarId))
      .filter(Boolean)
      .slice(0, safeLimit);

    if (ordered.length > 0) {
      return { found: true, results: ordered.map(rowToPuzzle) };
    }
  }

  const sourceThemes = parseJsonArray(source.themes);
  const primaryTheme = sourceThemes[0];
  const sourceRating = Number(source.rating || 0);

  const fallbackRows = primaryTheme
    ? db
        .prepare(
          `SELECT id, fen, moves, rating, themes
           FROM puzzles
           WHERE id != ? AND rating >= 0 AND rating <= ? AND themes LIKE ?
           ORDER BY ABS(rating - ?), RANDOM()
           LIMIT ?`
        )
        .all(id, safeMaxRating, `%${primaryTheme}%`, sourceRating, safeLimit)
    : db
        .prepare(
          `SELECT id, fen, moves, rating, themes
           FROM puzzles
           WHERE id != ? AND rating >= 0 AND rating <= ?
           ORDER BY ABS(rating - ?), RANDOM()
           LIMIT ?`
        )
        .all(id, safeMaxRating, sourceRating, safeLimit);

  return { found: true, results: fallbackRows.map(rowToPuzzle) };
}

function getStats() {
  const db = getDb();
  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS total_puzzles,
         MIN(rating) AS min_rating,
         MAX(rating) AS max_rating,
         AVG(rating) AS avg_rating
       FROM puzzles`
    )
    .get();

  return {
    total_puzzles: totals.total_puzzles || 0,
    min_rating: totals.min_rating || 0,
    max_rating: totals.max_rating || 0,
    avg_rating: totals.avg_rating ? Number(totals.avg_rating.toFixed(2)) : 0,
  };
}

module.exports = {
  PuzzleDatabaseError,
  getReadiness,
  getDiversePuzzles,
  getPuzzleById,
  getSimilarPuzzles,
  getStats,
};
