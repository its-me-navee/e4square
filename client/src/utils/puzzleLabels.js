const LOW_SIGNAL_THEMES = new Set([
  'short',
  'long',
  'master',
  'masterVsMaster',
  'oneMove',
]);

export const formatPuzzleTheme = (theme) => {
  if (!theme) return 'Tactical Position';

  return String(theme)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export const getPuzzleMotif = (themes = []) => {
  if (!Array.isArray(themes)) return 'Tactical Position';

  const motif = themes.find((theme) => theme && !LOW_SIGNAL_THEMES.has(theme));
  return formatPuzzleTheme(motif || themes[0]);
};

export const getPuzzleMoveLabel = (moves = []) => {
  const moveCount = Math.max(1, Math.ceil((Array.isArray(moves) ? moves.length : 0) / 2));
  return `${moveCount} ${moveCount === 1 ? 'move' : 'moves'}`;
};

export const getPuzzleRatingLabel = (rating) => {
  const numericRating = Number(rating);
  if (Number.isFinite(numericRating) && numericRating > 0) {
    return `Rating ${numericRating}`;
  }

  return 'Training position';
};
