import { useState } from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { rerunMatches } from '../lib/api'
import { useToast } from './Toast'
import { telemetry } from '../lib/telemetry'

interface RerunMatchesButtonProps {
  roleId: string | null
  /** 'full' fills its container; 'compact' is a snug inline button. */
  variant?: 'full' | 'compact'
}

/** Re-runs the matching cascade for a role, awaiting completion. */
export function RerunMatchesButton({ roleId, variant = 'full' }: RerunMatchesButtonProps) {
  const [running, setRunning] = useState(false)
  const toast = useToast()
  const queryClient = useQueryClient()

  const disabled = !roleId || running

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (!roleId || running) return

    setRunning(true)
    telemetry.capture('matches_rerun_started', { role_id: roleId, variant })
    const toastId = toast.show('loading', 'Running matching cascade — this can take 30s–2min…')
    try {
      const result = await telemetry.timed(
        'matches_rerun',
        () => rerunMatches(roleId),
        { thresholdMs: 120_000, props: { role_id: roleId } },
      )
      telemetry.capture('matches_rerun_completed', {
        role_id: roleId,
        total: result.total,
        scored: result.scored,
        plan_b: result.plan_b,
      })
      toast.update(
        toastId,
        'success',
        `Matching complete — ${result.scored} scored, ${result.plan_b} plan-B, ${result.total} candidates evaluated.`,
      )
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      queryClient.invalidateQueries({ queryKey: ['matches', roleId] })
    } catch (err) {
      telemetry.capture('matches_rerun_failed', {
        role_id: roleId,
        error_message: (err as Error).message?.slice(0, 200),
      })
      toast.update(toastId, 'error', `Rerun failed: ${(err as Error).message}`)
    } finally {
      setRunning(false)
    }
  }

  const base =
    'flex items-center justify-center gap-1.5 text-sm font-medium rounded-lg border border-primary text-primary transition-colors active:bg-primary/10 disabled:opacity-50'
  const sizing = variant === 'full' ? 'flex-1 py-2.5' : 'px-3 py-2 flex-shrink-0'

  return (
    <button data-telemetry-id="matches-rerun" onClick={handleClick} disabled={disabled} className={`${base} ${sizing}`}>
      {running ? (
        <Loader2 size={15} className="animate-spin" />
      ) : (
        <RefreshCw size={15} />
      )}
      {running ? 'Running…' : 'Rerun Matches'}
    </button>
  )
}
