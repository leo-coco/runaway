import { Link } from 'react-router-dom';
import { HomeIcon } from '@/components/icons';

interface Crumb {
  label: string;
  to?: string;
}

export const Breadcrumb = ({ items }: { items: readonly Crumb[] }) => (
  <nav className="breadcrumb" aria-label="Breadcrumb">
    <Link to="/" aria-label="Home">
      <HomeIcon size={15} />
    </Link>
    {items.map((c, i) => (
      <span
        key={`${c.label}-${i}`}
        style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}
      >
        <span className="sep">›</span>
        {c.to ? <Link to={c.to}>{c.label}</Link> : <span className="current">{c.label}</span>}
      </span>
    ))}
  </nav>
);
