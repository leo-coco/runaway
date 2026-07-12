import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertIcon } from '@/components/icons';

interface Props {
  feature: string;
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message: string;
}

/**
 * Per-feature error boundary. A crash inside one feature renders a local
 * fallback instead of taking down the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Centralised place to forward to a logging service.
    console.error(`[${this.props.feature}]`, error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="feature-error" role="alert">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
            <AlertIcon />
            <strong>Something went wrong in “{this.props.feature}”.</strong>
          </div>
          <p style={{ margin: '6px 0 0' }}>{this.state.message}</p>
          <button
            className="btn btn--sm"
            style={{ marginTop: 12 }}
            onClick={() => this.setState({ hasError: false, message: '' })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
