import React from 'react';

function getWhitePercent(evaluation) {
  if (!evaluation) return 50;

  if (evaluation.type === 'mate') {
    return evaluation.mate > 0 ? 96 : 4;
  }

  const pawns = Math.max(-8, Math.min(8, (evaluation.cp || 0) / 100));
  return Math.round(50 + pawns * 5);
}

const EvaluationBar = ({ evaluation, enabled, loading }) => {
  const whitePercent = getWhitePercent(evaluation);
  const label = enabled
    ? evaluation?.display || (loading ? '...' : '0.0')
    : 'Off';

  return (
    <div className={`eval-bar ${enabled ? 'enabled' : 'disabled'}`} aria-label="Engine evaluation">
      <div className="eval-bar-track">
        <div className="eval-bar-black" style={{ height: `${100 - whitePercent}%` }} />
        <div className="eval-bar-white" style={{ height: `${whitePercent}%` }} />
      </div>
      <span>{label}</span>
    </div>
  );
};

export default EvaluationBar;
