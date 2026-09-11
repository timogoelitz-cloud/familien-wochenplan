import { AppProvider, useApp } from './ui/store';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { Toasts } from './ui/components/Toasts';
import { WeekPlanView } from './ui/views/WeekPlanView';
import { ShoppingListView } from './ui/views/ShoppingListView';
import { MealsView } from './ui/views/MealsView';
import { SettingsView } from './ui/views/SettingsView';
import type { ViewName } from './ui/store';

const NAV: Array<{ id: ViewName; label: string; icon: string }> = [
  { id: 'plan', label: 'Wochenplan', icon: '🗓️' },
  { id: 'shopping', label: 'Einkaufsliste', icon: '🛒' },
  { id: 'meals', label: 'Gerichte', icon: '🍽️' },
  { id: 'settings', label: 'Einstellungen', icon: '⚙️' },
];

function Shell() {
  const { view, setView } = useApp();

  return (
    <div className="flex h-[100dvh] flex-col overflow-x-hidden">
      <header className="no-print flex items-center gap-3 border-b border-[color:var(--color-line)] bg-white/70 px-3 py-2 backdrop-blur sm:px-4">
        <span className="flex shrink-0 items-center gap-2 font-extrabold whitespace-nowrap">
          <span aria-hidden="true" className="text-2xl">
            🥘
          </span>
          <span className="hidden lg:inline">Familien-Wochenplan</span>
        </span>

        <nav aria-label="Hauptnavigation" className="ml-auto">
          <ul className="flex gap-1">
            {NAV.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  aria-current={view === entry.id ? 'page' : undefined}
                  onClick={() => setView(entry.id)}
                  className={`tap flex items-center gap-2 rounded-xl px-3 font-semibold whitespace-nowrap transition-colors sm:px-4 ${
                    view === entry.id
                      ? 'bg-[color:var(--color-ink)] text-white'
                      : 'hover:bg-[color:var(--color-parchment)]'
                  }`}
                >
                  <span aria-hidden="true">{entry.icon}</span>
                  <span className="hidden md:inline">{entry.label}</span>
                  <span className="sr-only md:hidden">{entry.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden p-2 sm:p-3 xl:p-4">
        {view === 'plan' && <WeekPlanView />}
        {view === 'shopping' && <ShoppingListView />}
        {view === 'meals' && <MealsView />}
        {view === 'settings' && <SettingsView />}
      </main>

      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Shell />
      </AppProvider>
    </ErrorBoundary>
  );
}
