const express = require('express');
const {
  PuzzleDatabaseError,
  getReadiness,
  getDiversePuzzles,
  getPuzzleById,
  getSimilarPuzzles,
  getStats,
} = require('../services/puzzleRepository');

const router = express.Router();

function sendError(res, error) {
  if (error instanceof PuzzleDatabaseError) {
    return res.status(503).json({
      error: 'Puzzle database unavailable',
      detail: error.message,
      readiness: getReadiness(),
    });
  }

  console.error('Puzzle API error:', error);
  return res.status(500).json({ error: 'Puzzle API failed' });
}

router.get('/health', (req, res) => {
  res.json(getReadiness());
});

router.get('/stats', (req, res) => {
  try {
    res.json(getStats());
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/', (req, res) => {
  try {
    const puzzles = getDiversePuzzles({
      limit: req.query.limit,
      maxRating: req.query.max_rating,
    });

    res.json({ puzzles });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/:id', (req, res) => {
  try {
    const puzzle = getPuzzleById(req.params.id);
    if (!puzzle) {
      return res.status(404).json({ error: 'Puzzle not found' });
    }

    res.json({ puzzle });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/:id/similar', (req, res) => {
  try {
    const { found, results } = getSimilarPuzzles(req.params.id, {
      limit: req.query.limit || req.query.top_k,
      maxRating: req.query.max_rating,
    });

    if (!found) {
      return res.status(404).json({ error: 'Puzzle not found' });
    }

    res.json({ query_puzzle_id: req.params.id, results });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:id/prefetch', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = router;
