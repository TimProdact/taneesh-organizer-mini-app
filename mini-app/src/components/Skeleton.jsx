export function Skeleton({ width = '100%', height = 14, className = '', style = {} }) {
  return (
    <span
      className={`fm-skeleton ${className}`.trim()}
      style={{ width, height, ...style }}
      aria-hidden
    />
  );
}
