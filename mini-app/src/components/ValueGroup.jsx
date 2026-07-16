export function ValueGroup({ children, className = '' }) {
  return (
    <div className={`fm-inset-card fm-value-group ${className}`.trim()}>
      {children}
    </div>
  );
}
