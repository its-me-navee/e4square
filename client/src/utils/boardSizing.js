export function getViewportBoardSize({
  max = 520,
  min = 260,
  reservedWidth = 0,
  reservedHeight = 220,
} = {}) {
  const width = window.innerWidth || max;
  const height = window.innerHeight || max;
  const sidePadding = width <= 560 ? 24 : width <= 900 ? 40 : 80;
  const usableWidth = width - reservedWidth - sidePadding;
  const usableHeight = height - reservedHeight;
  const size = Math.min(max, usableWidth, usableHeight);
  const floor = Math.min(
    min,
    Math.max(240, usableWidth),
    Math.max(240, usableHeight)
  );

  return Math.floor(Math.max(floor, size));
}
