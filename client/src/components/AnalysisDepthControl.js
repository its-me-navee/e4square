import React from 'react';
import { MAX_ANALYSIS_DEPTH, MIN_ANALYSIS_DEPTH } from '../utils/stockfish';

const AnalysisDepthControl = ({
  depth,
  onChange,
  disabled = false,
  className = '',
}) => (
  <label className={`analysis-depth-control ${className}`.trim()}>
    <span className="control-label">Depth</span>
    <input
      type="range"
      min={MIN_ANALYSIS_DEPTH}
      max={MAX_ANALYSIS_DEPTH}
      step="1"
      value={depth}
      disabled={disabled}
      aria-label="Analysis depth"
      onChange={(event) => onChange(event.target.value)}
    />
    <strong>{depth}</strong>
  </label>
);

export default AnalysisDepthControl;
