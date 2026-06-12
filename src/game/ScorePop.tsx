import { useState, useRef } from 'react'

export interface ScorePopData {
  id: number
  label: string
  emoji: string
  color: string
  top: number
  left: number
}

interface ScorePopOverlayProps {
  pops: ScorePopData[]
}

export function ScorePopOverlay({ pops }: ScorePopOverlayProps) {
  if (pops.length === 0) return null
  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]">
      {pops.map((pop) => (
        <div
          key={pop.id}
          className="game-float-score"
          style={{ top: pop.top, left: pop.left, color: pop.color }}
        >
          <div
            className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-base font-black shadow-2xl backdrop-blur-sm border"
            style={{
              background: 'rgba(15, 10, 40, 0.85)',
              borderColor: `${pop.color}50`,
              boxShadow: `0 4px 24px ${pop.color}40, 0 0 0 1px ${pop.color}20`,
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>{pop.emoji}</span>
            <span>{pop.label}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

let _popId = 0

export function useScorePops() {
  const [pops, setPops] = useState<ScorePopData[]>([])
  const containerRef = useRef<HTMLDivElement | null>(null)

  function addPop(
    label: string,
    emoji: string,
    color: string,
    anchorEl?: HTMLElement | null,
  ) {
    const id = ++_popId
    // Default to center-ish of the viewport
    const top  = anchorEl ? anchorEl.getBoundingClientRect().top  - 40  : window.innerHeight * 0.35
    const left = anchorEl ? anchorEl.getBoundingClientRect().left + anchorEl.offsetWidth / 2 : window.innerWidth * 0.5

    setPops((p) => [...p, { id, label, emoji, color, top, left }])
    setTimeout(() => {
      setPops((p) => p.filter((pop) => pop.id !== id))
    }, 1600)
  }

  return { pops, addPop, containerRef }
}
