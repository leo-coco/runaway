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
        Runway could not start because some required API keys are missing or invalid. Copy{' '}
        <code>.env.example</code> to <code>.env</code> and provide the following:
      </p>
      <ul>
        {issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
      <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
        Get free keys from{' '}
        <a style={{ color: 'var(--accent)' }} href="https://www.alphavantage.co/support/#api-key">
          Alpha Vantage
        </a>{' '}
        (stocks) and{' '}
        <a style={{ color: 'var(--accent)' }} href="https://www.exchangerate-api.com/">
          ExchangeRate-API
        </a>{' '}
        (FX). CoinGecko (crypto) needs no key. Restart the dev server after editing{' '}
        <code>.env</code>.
      </p>
    </div>
  </div>
);
