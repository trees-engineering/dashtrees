import {
  createContext, useCallback, useContext, useState, type ReactNode,
} from 'react'
import { CheckCircle2, XCircle, Info, Loader2, X } from 'lucide-react'
import { telemetry } from '../lib/telemetry'

export type ToastType = 'success' | 'error' | 'info' | 'loading'

interface ToastItem {
  id: number
  type: ToastType
  message: string
}

interface ToastApi {
  /** Show a toast, returns its id. */
  show: (type: ToastType, message: string) => number
  /** Update an existing toast (e.g. loading → success). */
  update: (id: number, type: ToastType, message: string) => void
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}

let nextId = 1
const AUTO_DISMISS_MS = 6500

const ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  loading: Loader2,
}

const ACCENT: Record<ToastType, string> = {
  success: 'text-green-500',
  error: 'text-red-500',
  info: 'text-primary',
  loading: 'text-primary',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const autoDismiss = useCallback((id: number, type: ToastType) => {
    if (type === 'loading') return
    window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
  }, [dismiss])

  const show = useCallback((type: ToastType, message: string) => {
    const id = nextId++
    setToasts((t) => [...t, { id, type, message }])
    autoDismiss(id, type)
    if (type === 'error') {
      telemetry.capture('api_error_shown', { message: message.slice(0, 200) })
    }
    return id
  }, [autoDismiss])

  const update = useCallback((id: number, type: ToastType, message: string) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, type, message } : x)))
    autoDismiss(id, type)
    if (type === 'error') {
      telemetry.capture('api_error_shown', { message: message.slice(0, 200) })
    }
  }, [autoDismiss])

  return (
    <ToastContext.Provider value={{ show, update, dismiss }}>
      {children}
      <div className="fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map((t) => {
          const Icon = ICONS[t.type]
          return (
            <div
              key={t.id}
              className="pointer-events-auto w-full max-w-sm flex items-start gap-2.5 bg-treeSurface border border-treeBorder rounded-xl shadow-lg px-3.5 py-3"
            >
              <Icon
                size={18}
                className={`flex-shrink-0 mt-0.5 ${ACCENT[t.type]} ${t.type === 'loading' ? 'animate-spin' : ''}`}
              />
              <p className="flex-1 text-sm text-treeText leading-snug">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="flex-shrink-0 text-treeTextSec active:text-treeText"
                aria-label="Dismiss"
              >
                <X size={15} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
