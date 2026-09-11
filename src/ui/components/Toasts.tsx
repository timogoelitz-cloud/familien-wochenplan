import { useApp } from '../store';

const TONE_STYLES: Record<string, string> = {
  info: 'bg-[color:var(--color-ink)] text-white',
  success: 'bg-[color:var(--color-sage-dark)] text-white',
  error: 'bg-[color:var(--color-terracotta-dark)] text-white',
};

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;

  return (
    <div
      className="no-print pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4"
      aria-live="polite"
      role="status"
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismissToast(toast.id)}
          className={`animate-pop-in pointer-events-auto max-w-xl rounded-xl px-5 py-3 text-left font-medium shadow-lg ${TONE_STYLES[toast.tone] ?? TONE_STYLES.info}`}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
