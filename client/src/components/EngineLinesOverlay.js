import React, { useMemo, useRef } from 'react';

const LINE_COLORS = ['#81b64c', '#f2c14e', '#5aa2e8'];
const FILES = 'abcdefgh';

function squareCenter(square, orientation) {
  if (!square || square.length < 2) return null;

  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  if (file < 0 || rank < 1 || rank > 8) return null;

  const displayFile = orientation === 'black' ? 7 - file : file;
  const displayRank = orientation === 'black' ? rank - 1 : 8 - rank;

  return {
    x: (displayFile + 0.5) * 12.5,
    y: (displayRank + 0.5) * 12.5,
  };
}

function shortenLine(from, to, amount = 3.2) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!length) return { from, to };

  return {
    from,
    to: {
      x: to.x - (dx / length) * amount,
      y: to.y - (dy / length) * amount,
    },
  };
}

const EngineLinesOverlay = ({ lines = [], orientation = 'white', enabled = true }) => {
  const markerPrefixRef = useRef(`engine-line-${Math.random().toString(36).slice(2)}`);

  const arrows = useMemo(() => {
    if (!enabled || !Array.isArray(lines) || lines.length === 0) return [];

    return lines
      .slice(0, 3)
      .map((line, index) => {
        const from = squareCenter(line.move?.slice(0, 2), orientation);
        const to = squareCenter(line.move?.slice(2, 4), orientation);
        if (!from || !to) return null;

        const weight = Math.max(0.42, Math.min(1, line.weight ?? 1 - index * 0.18));
        const path = shortenLine(from, to);
        const color = LINE_COLORS[index] || LINE_COLORS[LINE_COLORS.length - 1];

        return {
          ...path,
          color,
          opacity: 0.36 + weight * 0.34,
          strokeWidth: 1.05 + weight * 0.75,
          markerId: `${markerPrefixRef.current}-${index}`,
        };
      })
      .filter(Boolean);
  }, [enabled, lines, orientation]);

  if (arrows.length === 0) return null;

  return (
    <svg
      className="engine-lines-overlay"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {arrows.map((arrow) => (
          <marker
            key={arrow.markerId}
            id={arrow.markerId}
            markerWidth="4.2"
            markerHeight="4.2"
            refX="3.6"
            refY="2.1"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 4.2 2.1 L 0 4.2 z" fill={arrow.color} />
          </marker>
        ))}
      </defs>

      {arrows.map((arrow) => (
        <line
          key={`${arrow.markerId}-${arrow.from.x}-${arrow.from.y}-${arrow.to.x}-${arrow.to.y}`}
          className="engine-line-arrow"
          x1={arrow.from.x}
          y1={arrow.from.y}
          x2={arrow.to.x}
          y2={arrow.to.y}
          stroke={arrow.color}
          strokeWidth={arrow.strokeWidth}
          strokeLinecap="round"
          markerEnd={`url(#${arrow.markerId})`}
          opacity={arrow.opacity}
        />
      ))}
    </svg>
  );
};

export default EngineLinesOverlay;
