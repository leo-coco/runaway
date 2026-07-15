import { Link } from 'react-router-dom';

export const AppHeader = () => (
  <header className="header">
    <div className="container header__inner">
      <Link to="/" className="brand" aria-label="retire on model — home">
        <span className="brand__mark" aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
            <rect width="30" height="30" rx="9" fill="var(--accent)" />
            <path
              d="M7 19.5 L12 14 L16 17 L23 9.5"
              stroke="#06262b"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="23" cy="9.5" r="2.1" fill="#06262b" />
          </svg>
        </span>
        <span className="brand__text">
          <span className="brand__name">retire on model</span>
          <span className="brand__sub">retirement planning</span>
        </span>
      </Link>
      <nav className="nav">
        <Link to="/">My Plans</Link>
      </nav>
    </div>
  </header>
);
