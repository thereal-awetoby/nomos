import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

type ToastVariant = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })
const TOAST_MS = 2800
const MAX_TOASTS = 3

const variantStyles: Record<ToastVariant, string> = {
  success: 'border-nomos-accent/60 text-nomos-accent',
  error: 'border-nomos-refuse/60 text-nomos-refuse',
  info: 'border-nomos-border/35 text-nomos-text',
}

const variantIcon: Record<ToastVariant, string> = {
  success: '✓',
  error: '✕',
  info: '•',
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(0)
  const timers = useRef(new Map<number, number>())

  useEffect(() => {
    const activeTimers = timers.current
    return () => activeTimers.forEach((timer) => window.clearTimeout(timer))
  }, [])

  const dismiss = useCallback((id: number) => {
    setItems((previous) => previous.filter((item) => item.id !== id))
    const timer = timers.current.get(id)
    if (timer !== undefined) window.clearTimeout(timer)
    timers.current.delete(id)
  }, [])

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = ++nextId.current
    setItems((previous) => [...previous, { id, message, variant }].slice(-MAX_TOASTS))
    timers.current.set(id, window.setTimeout(() => dismiss(id), TOAST_MS))
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-5"
        role="status"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => dismiss(item.id)}
            aria-label={`Dismiss notification: ${item.message}`}
            className={`toast-enter pointer-events-auto flex max-w-sm items-center gap-2.5 border bg-nomos-surface px-3 py-2 font-mono text-[11px] font-medium shadow-[0_8px_24px_rgba(0,0,0,0.3)] ${variantStyles[item.variant]}`}
          >
            <span aria-hidden="true" className="font-mono">{variantIcon[item.variant]}</span>
            <span className="text-left">{item.message}</span>
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
