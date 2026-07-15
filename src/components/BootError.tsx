import { AlertIcon } from '@/components/icons';

/**
 * Rendered at boot when required environment keys are missing or invalid.
 * Per the architecture spec, the app does not silently proceed without config.
 */
export const BootError = ({ issues }: { issues: readonly string[] }) => (
  <div className="boot-screen">
    <div className="boot-card">
      <h1 style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <AlertIcon size={22} /> Configuration required
      </h1>
      <p style={{ color: 'var(--text-muted)' }}>
        Runway could not start because some client configuration is invalid. Copy{' '}
        <code>.env.example</code> to <code>.env</code> and fix the following:
      </p>
      <ul>
        {issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.8125rem' }}>
        The FX (ExchangeRate-API) key is server-side only — set <code>EXCHANGERATE_API_KEY</code> in
        the API environment, not here. Stock quotes (Yahoo) and crypto (CoinGecko) need no key.
        Restart the dev server after editing <code>.env</code>.
      </p>
    </div>
  </div>
);
