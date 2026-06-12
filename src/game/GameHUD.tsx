import { useRef, useEffect, useState } from 'react'
import type { GameStats } from './gamification'

interface GameHUDProps {
  stats: GameStats | null
  loading?: boolean
}

function XPBar({ pct, color, nextColor }: { pct: number; color: string; nextColor: string }) {
  const [width, setWidth] = useState(0)

  useEffect(() => {
    // Defer to next frame so CSS transition triggers
    const id = requestAnimationFrame(() => setWidth(pct))
    return () => cancelAnimationFrame(id)
  }, [pct])

  return (
    <div className="h-3 rounded-full overflow-hidden bg-slate-800/80 border border-white/5">
      <div
        className="h-full rounded-full relative overflow-hidden transition-[width] duration-[1200ms] ease-out"
        style={{
          width: `${width}%`,
          background: `linear-gradient(90deg, ${color}, ${nextColor})`,
          boxShadow: `0 0 10px ${color}70`,
        }}
      >
        <div className="absolute inset-0 game-shimmer-bar" />
      </div>
    </div>
  )
}

export function GameHUD({ stats, loading }: GameHUDProps) {
  const prevXP = useRef(0)
  const [xpFlash, setXpFlash] = useState(false)

  useEffect(() => {
    if (!stats) return
    if (stats.totalXP > prevXP.current && prevXP.current !== 0) {
      setXpFlash(true)
      setTimeout(() => setXpFlash(false), 800)
    }
    prevXP.current = stats.totalXP
  }, [stats?.totalXP])

  if (loading || !stats) {
    return (
      <div className="flex-shrink-0 h-[68px] bg-gradient-to-r from-slate-900 via-purple-950/60 to-slate-900 border-b border-purple-900/30 animate-pulse" />
    )
  }

  const { level, nextLevel, progressPct, stars, gems, totalXP, xpToNextLevel } = stats

  return (
    <div className="flex-shrink-0 bg-gradient-to-r from-slate-900 via-purple-950/40 to-slate-900 border-b border-purple-900/30 px-3 sm:px-4 py-2">
      <div className="flex items-center gap-3">
        {/* Level badge */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 transition-all duration-300"
            style={{
              background: `linear-gradient(135deg, ${level.color}30, ${level.color}10)`,
              border: `2px solid ${level.color}60`,
              boxShadow: `0 0 16px ${level.color}40`,
            }}
          >
            {level.emoji}
          </div>
          <div className="hidden sm:block">
            <div className="text-[11px] font-black text-white leading-tight">{level.title}</div>
            <div className="text-[9px] text-purple-400 uppercase tracking-wider leading-tight">
              Level {level.level}
            </div>
          </div>
        </div>

        {/* XP bar + label */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center justify-between">
            <span
              className={`text-[10px] font-black tabular-nums transition-all duration-300 ${
                xpFlash ? 'text-yellow-300 scale-110' : 'text-purple-200'
              }`}
            >
              {totalXP.toLocaleString()} XP
            </span>
            {nextLevel && (
              <span className="text-[9px] text-slate-500 hidden xs:inline">
                {xpToNextLevel.toLocaleString()} → {nextLevel.title}
              </span>
            )}
            {!nextLevel && (
              <span className="text-[9px] text-purple-500 font-black">MAX LEVEL</span>
            )}
          </div>
          <XPBar pct={progressPct} color={level.color} nextColor={level.nextColor} />
        </div>

        {/* Stars */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div
            className="flex items-center gap-1 rounded-full px-2.5 py-1 border text-xs font-black tabular-nums"
            style={{
              background: 'rgba(251, 191, 36, 0.12)',
              borderColor: 'rgba(251, 191, 36, 0.30)',
              color: '#fbbf24',
            }}
          >
            <span>⭐</span>
            <span>{stars}</span>
          </div>
          <div
            className="flex items-center gap-1 rounded-full px-2.5 py-1 border text-xs font-black tabular-nums"
            style={{
              background: 'rgba(34, 211, 238, 0.12)',
              borderColor: 'rgba(34, 211, 238, 0.30)',
              color: '#22d3ee',
            }}
          >
            <span>💎</span>
            <span>{gems}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
