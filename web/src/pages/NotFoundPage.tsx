import { Link } from 'react-router-dom';
import { Shell } from '../components/Shell.js';
import { Icon } from '../components/Icon.js';

/** Catch-all route. Unknown URLs used to render a completely blank page with no rail. */
export function NotFoundPage({ what = 'page' }: { what?: string }) {
  return (
    <Shell crumbs={[{ label: 'Not found' }]}>
      <div className="empty">
        <Icon name="lens" size={22} className="empty-icon" />
        <h3>This {what} doesn’t exist</h3>
        <p className="muted">It may have been deleted, or the link is wrong.</p>
        <p>
          <Link to="/" className="chip">
            <Icon name="home" size={13} />
            Back to overview
          </Link>
        </p>
      </div>
    </Shell>
  );
}
