import React from 'react';
import { isChunkLoadError } from '../lib/lazyWithRetry';

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

      // A failed route chunk cannot be recovered by re-rendering. React.lazy
      // latches its payload as Rejected on first failure and never calls the
      // factory again, so the old `setState({ hasError: false })` button
      // re-rendered, the lazy rethrew synchronously, and the same screen came
      // straight back -- a "Try Again" that provably could not work. A fresh
      // document is the only thing that recovers it.
      const isChunk = isChunkLoadError(this.state.error);

      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] p-8 text-center">
          <div className="text-4xl mb-4">{isChunk ? '📶' : '⚠️'}</div>
          <h2 className="font-[Bebas_Neue] text-2xl text-[#E8E2D6] mb-2">
            {isChunk ? 'Couldn’t finish loading' : 'Something went wrong'}
          </h2>
          <p className="text-[#9CA3AF] text-sm mb-6 max-w-[280px]">
            {isChunk
              ? 'That page didn’t download properly — usually a patchy signal, or the app updated while you had it open.'
              : this.state.error?.message ?? 'Unexpected error'}
          </p>
          <button
            onClick={() => {
              if (isChunk) {
                window.location.reload();
              } else {
                this.setState({ hasError: false, error: null });
              }
            }}
            className="btn-crimson px-6 py-3 text-sm"
          >
            {isChunk ? 'Reload' : 'Try Again'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
