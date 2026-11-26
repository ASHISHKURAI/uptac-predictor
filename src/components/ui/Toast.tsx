import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastTone = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  tone: ToastTone
  title: string
  description?: string
}

interface ToastApi {
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)
let counter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), [])
  const push = useCallback(
    (tone: ToastTone, title: string, description?: string) => {
      const id = ++counter
      setItems((list) => [...list.slice(-3), { id, tone, title, description }])
      setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4500)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      success: (t, d) => push('success', t, d),
      error: (t, d) => push('error', t, d),
      info: (t, d) => push('info', t, d),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[90] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 rounded-2xl border bg-white p-4 shadow-xl',
              t.tone === 'error' ? 'border-red-200' : t.tone === 'success' ? 'border-emerald-200' : 'border-royal-200',
            )}
          >
            {t.tone === 'success' ? (
              <CircleCheck className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
            ) : t.tone === 'error' ? (
              <CircleAlert className="h-5 w-5 shrink-0 text-red-600" aria-hidden />
            ) : (
              <Info className="h-5 w-5 shrink-0 text-royal-600" aria-hidden />
            )}
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold text-navy-900">{t.title}</p>
              {t.description && <p className="mt-0.5 text-navy-600">{t.description}</p>}
            </div>
            <button type="button" onClick={() => dismiss(t.id)} className="text-navy-400 hover:text-navy-700" aria-label="Dismiss notification">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
