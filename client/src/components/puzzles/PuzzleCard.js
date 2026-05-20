import React from 'react';
import MiniBoard from './MiniBoard';
import { formatPuzzleTheme, getPuzzleMotif, getPuzzleMoveLabel, getPuzzleRatingLabel } from '../../utils/puzzleLabels';

const PuzzleCard = ({ puzzle, onOpen }) => {
  const themes = Array.isArray(puzzle.themes) ? puzzle.themes : [];
  const visibleThemes = themes
    .filter((theme) => !['short', 'long', 'master', 'masterVsMaster'].includes(theme))
    .slice(0, 2);

  return (
    <button className="puzzle-card-button" onClick={() => onOpen(puzzle)} type="button">
      <MiniBoard fen={puzzle.fen} />
      <span className="puzzle-card-meta">
        <span className="puzzle-card-title">{getPuzzleMotif(themes)}</span>
        <span>{getPuzzleMoveLabel(puzzle.moves)} · {getPuzzleRatingLabel(puzzle.rating)}</span>
        {visibleThemes.length > 0 && (
          <span className="puzzle-card-tags">
            {visibleThemes.map(formatPuzzleTheme).join(', ')}
          </span>
        )}
      </span>
    </button>
  );
};

export default PuzzleCard;
