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
    db.pragma('query_only = ON');
    db.pragma('busy_timeout = 5000');
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

function parseRating(rawRating, fallback) {
  const value = Number.parseInt(rawRating, 10);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return value;
}

function randomIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function uniqueRows(rows, limit) {
  const seen = new Set();
  const unique = [];

  for (const row of rows) {
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    unique.push(row);
    if (unique.length >= limit) break;
  }

  return unique;
}

function rowMatchesFilters(row, {
  minRating,
  maxRating,
  theme,
  excludeId,
}) {
  if (!row) return false;
  if (excludeId && row.id === excludeId) return false;
  if (Number(row.rating || 0) < minRating || Number(row.rating || 0) > maxRating) return false;
  if (theme && !parseJsonArray(row.themes).includes(theme)) return false;
  return true;
}

function getRandomPuzzleRows(db, {
  limit = 15,
  minRating = 0,
  maxRating = 3000,
  theme,
  excludeId,
} = {}) {
  const safeLimit = clampLimit(limit, 15, 200);
  const safeMinRating = parseRating(minRating, 0);
  const safeMaxRating = parseRating(maxRating, 3000);

  if (safeMinRating > safeMaxRating) return [];
  const range = db
    .prepare('SELECT MIN(rowid) AS minRowid, MAX(rowid) AS maxRowid FROM puzzles')
    .get();

  if (!range?.minRowid || !range?.maxRowid) return [];

  const batchSize = theme ? 48 : 20;
  const forwardStmt = db.prepare(
    `SELECT id, fen, moves, rating, themes
     FROM puzzles
     WHERE rowid >= ?
     ORDER BY rowid
     LIMIT ?`
  );
  const wrapStmt = db.prepare(
    `SELECT id, fen, moves, rating, themes
     FROM puzzles
     WHERE rowid < ?
     ORDER BY rowid
     LIMIT ?`
  );

  const selected = [];
  const seenIds = new Set();
  const minRowid = Number(range.minRowid);
  const maxRowid = Number(range.maxRowid);
  const maxAttempts = Math.max(safeLimit * (theme ? 35 : 8), 80);

  for (let attempt = 0; attempt < maxAttempts && selected.length < safeLimit; attempt += 1) {
    const rowid = randomIntInclusive(minRowid, maxRowid);
    const rows = forwardStmt.all(rowid, batchSize);
    const candidates = rows.length > 0 ? rows : wrapStmt.all(rowid, batchSize);

    for (const row of candidates) {
      if (!rowMatchesFilters(row, {
        minRating: safeMinRating,
        maxRating: safeMaxRating,
        theme,
        excludeId,
      })) {
        continue;
      }

      if (!seenIds.has(row.id)) {
        seenIds.add(row.id);
        selected.push(row);
      }

      if (selected.length >= safeLimit) break;
    }
  }

  if (selected.length < safeLimit) {
    const clauses = ['rating >= ?', 'rating <= ?'];
    const params = [safeMinRating, safeMaxRating];

    if (theme) {
      clauses.push('themes LIKE ?');
      params.push(`%${theme}%`);
    }

    if (excludeId) {
      clauses.push('id != ?');
      params.push(excludeId);
    }

    const whereSql = clauses.join(' AND ');
    const fillRows = db
      .prepare(
        `SELECT id, fen, moves, rating, themes
         FROM puzzles
         WHERE ${whereSql}
         ORDER BY rowid
         LIMIT ?`
      )
      .all(...params, safeLimit * 2);

    for (const row of fillRows) {
      if (!seenIds.has(row.id)) {
        seenIds.add(row.id);
        selected.push(row);
      }
      if (selected.length >= safeLimit) break;
    }
  }

  return selected;
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
  const safeMaxRating = parseRating(maxRating, 2100);
  const sampleSize = Math.min(safeLimit * 4, 200);

  const rows = getRandomPuzzleRows(db, {
    limit: sampleSize,
    maxRating: safeMaxRating,
  });

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
  const safeMaxRating = parseRating(maxRating, 3000);

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
  const lowerRating = Math.max(0, sourceRating - 350);
  const upperRating = Math.min(safeMaxRating, sourceRating + 350);
  const fallbackRows = [];

  if (primaryTheme) {
    fallbackRows.push(
      ...getRandomPuzzleRows(db, {
        limit: safeLimit * 4,
        minRating: lowerRating,
        maxRating: upperRating,
        theme: primaryTheme,
        excludeId: id,
      })
    );
  }

  fallbackRows.push(
    ...getRandomPuzzleRows(db, {
      limit: safeLimit * 4,
      minRating: lowerRating,
      maxRating: upperRating,
      excludeId: id,
    })
  );

  if (fallbackRows.length < safeLimit) {
    fallbackRows.push(
      ...getRandomPuzzleRows(db, {
        limit: safeLimit * 4,
        maxRating: safeMaxRating,
        excludeId: id,
      })
    );
  }

  const rankedRows = uniqueRows(fallbackRows, safeLimit * 4).sort(
    (left, right) => Math.abs(Number(left.rating || 0) - sourceRating) - Math.abs(Number(right.rating || 0) - sourceRating)
  );

  return { found: true, results: rankedRows.slice(0, safeLimit).map(rowToPuzzle) };
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
