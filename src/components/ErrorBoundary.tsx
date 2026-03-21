import React from 'react';

interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode; fallback?: React.ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[TOC ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] p-8 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="font-[Bebas_Neue] text-2xl text-[#E8E2D6] mb-2">Something went wrong</h2>
          <p className="text-[#9CA3AF] text-sm mb-6">{this.state.error?.message ?? 'Unexpected error'}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="btn-crimson px-6 py-3 text-sm"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
