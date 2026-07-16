import { Skeleton } from './Skeleton.jsx';

export function HubSkeleton({ hint = 'Загрузка…' }) {
  return (
    <main className="fm-twa fm-home fm-hub" aria-busy="true" aria-label={hint}>
      <p className="fm-hub-loading-hint">{hint}</p>
      <header className="fm-hub-hero">
        <div className="fm-hub-hero-bar">
          <Skeleton width={40} height={40} style={{ borderRadius: '50%' }} />
        </div>
        <div className="fm-hub-hero-center">
          <Skeleton width={88} height={88} style={{ borderRadius: '50%' }} />
          <Skeleton width="42%" height={26} style={{ borderRadius: 6, marginTop: 14 }} />
          <Skeleton width="34%" height={16} style={{ borderRadius: 4, marginTop: 8 }} />
        </div>
      </header>
      <div className="fm-hub-actions fm-hub-actions--4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="fm-hub-action fm-hub-action--skeleton">
            <Skeleton width={28} height={28} style={{ borderRadius: 6 }} />
            <Skeleton width="52%" height={13} style={{ borderRadius: 4 }} />
          </div>
        ))}
      </div>
    </main>
  );
}
