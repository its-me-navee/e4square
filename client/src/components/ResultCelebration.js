import React from 'react';
import { Activity, Handshake, ShieldX, Sparkles, Trophy } from 'lucide-react';

const burstPieces = Array.from({ length: 34 }, (_, index) => ({
  index,
  x: ((index * 47) % 220) - 110,
  drift: ((index * 29) % 90) - 45,
  delay: (index % 8) * 0.055,
  size: 7 + (index % 4) * 3,
  hue: 42 + ((index * 31) % 95),
}));

const copy = {
  win: {
    title: 'Victory',
    kicker: 'Brilliant finish',
    Icon: Trophy,
  },
  loss: {
    title: 'Defeat',
    kicker: 'Reset and fight back',
    Icon: ShieldX,
  },
  draw: {
    title: 'Draw',
    kicker: 'Balanced result',
    Icon: Handshake,
  },
};

const ResultCelebration = ({ tone, message, onAnalyze }) => {
  if (!tone || !message) return null;

  const safeTone = copy[tone] ? tone : 'draw';
  const { title, kicker, Icon } = copy[safeTone];

  return (
    <div className={`result-celebration result-celebration-${safeTone}`} aria-live="polite">
      <div className="celebration-rings" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <div className="celebration-pieces" aria-hidden="true">
        {burstPieces.map((piece) => (
          <span
            key={piece.index}
            style={{
              '--burst-x': `${piece.x}px`,
              '--burst-drift': `${piece.drift}px`,
              '--burst-delay': `${piece.delay}s`,
              '--burst-size': `${piece.size}px`,
              '--burst-rotate': `${piece.index * 23}deg`,
              '--burst-hue': piece.hue,
            }}
          />
        ))}
      </div>

      <div className="celebration-card">
        <span className="celebration-icon">
          <Icon size={38} />
        </span>
        <span className="celebration-kicker">
          <Sparkles size={15} />
          {kicker}
        </span>
        <strong>{title}</strong>
        <span>{message}</span>
        {typeof onAnalyze === 'function' && (
          <button type="button" className="celebration-analyze-button" onClick={onAnalyze}>
            <Activity size={16} />
            Analyze with Engine
          </button>
        )}
      </div>
    </div>
  );
};

export default ResultCelebration;
