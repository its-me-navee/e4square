import React from 'react';

const EvalToggle = ({ enabled, onChange, value = '', className = '' }) => (
  <label className={`eval-toggle-row ${className}`.trim()}>
    <span className="eval-toggle-label">Eval</span>
    <input
      className="eval-switch-input"
      type="checkbox"
      checked={enabled}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span className="eval-switch" aria-hidden="true">
      <span />
    </span>
    {value && <span className="eval-toggle-value">{value}</span>}
  </label>
);

export default EvalToggle;
