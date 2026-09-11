/**
 * Faengt Render-Fehler ab, damit statt einer weissen Seite eine
 * verstaendliche Meldung mit Ausweg erscheint.
 */
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unerwarteter Fehler in der Oberflaeche', error, info);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div role="alert" className="flex min-h-screen items-center justify-center p-6">
        <div className="card max-w-lg p-7">
          <h1 className="text-2xl font-bold">Da ist etwas schiefgelaufen</h1>
          <p className="mt-3 text-[color:var(--color-muted)]">
            Die Anwendung konnte diese Ansicht nicht darstellen. Deine gespeicherten Daten sind davon
            nicht betroffen – sie liegen weiterhin lokal in diesem Browser.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-[color:var(--color-parchment)] p-3 text-sm">
            {error.message}
          </pre>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              className="tap rounded-xl bg-[color:var(--color-terracotta)] px-5 font-semibold text-white"
              onClick={() => this.setState({ error: null })}
            >
              Erneut versuchen
            </button>
            <button
              type="button"
              className="tap rounded-xl border border-[color:var(--color-line)] bg-white px-5 font-semibold"
              onClick={() => window.location.reload()}
            >
              App neu laden
            </button>
          </div>
        </div>
      </div>
    );
  }
}
