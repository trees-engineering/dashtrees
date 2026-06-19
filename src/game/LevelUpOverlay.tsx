import { useEffect } from 'react'
import type { GameLevel } from './gamification'

interface Props {
  level: GameLevel
  onDismiss: () => void
}

export function LevelUpOverlay({ level, onDismiss }: Props) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 4500)
    return () => clearTimeout(id)
  }, [onDismiss])

  return (
    <div
      className="fixed inset-0 z-[9998] flex flex-col items-center justify-center cursor-pointer select-none"
      style={{ background: 'rgba(3,12,30,0.97)' }}
      onClick={onDismiss}
    >
      {/* Light rays */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="absolute top-1/2 left-1/2 origin-bottom-left"
            style={{
              width: 2,
              height: '60vmax',
              background: `linear-gradient(to top, ${level.color}18, transparent)`,
              transform: `rotate(${i * 30}deg) translateX(-50%)`,
            }}
          />
        ))}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ width: 400, height: 400, background: `radial-gradient(circle, ${level.color}18 0%, transparent 70%)` }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 animate-[fadeIn_0.4s_ease-out]">
        {/* "RANK UP" label */}
        <p
          className="text-[11px] font-black uppercase tracking-[0.5em]"
          style={{ color: level.color, textShadow: `0 0 20px ${level.color}` }}
        >
          ✦ RANK UP ✦
        </p>

        {/* Diamond badge */}
        <div className="relative flex items-center justify-center">
          <div
            className="absolute rounded-full"
            style={{ width: 280, height: 280, background: `radial-gradient(circle, ${level.color}20 0%, transparent 70%)` }}
          />
          <div
            style={{
              width: 160,
              height: 160,
              borderRadius: 28,
              transform: 'rotate(45deg)',
              background: `linear-gradient(135deg, ${level.color}25, rgba(0,8,28,0.95))`,
              border: `3px solid ${level.color}80`,
              boxShadow: `0 0 60px ${level.color}70, 0 0 120px ${level.color}30`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ transform: 'rotate(-45deg)', fontSize: 80, lineHeight: 1, filter: `drop-shadow(0 0 20px ${level.color})` }}>
              {level.emoji}
            </span>
          </div>
        </div>

        {/* Rank title */}
        <div className="text-center">
          <h1
            className="font-black text-5xl mb-2"
            style={{ color: level.color, textShadow: `0 0 40px ${level.color}80` }}
          >
            {level.title}
          </h1>
          <p className="text-white/40 text-sm font-semibold tracking-widest uppercase">
            Level {level.level}
          </p>
        </div>

        <p className="text-white/25 text-xs tracking-widest">Tap to continue</p>
      </div>
    </div>
  )
}
