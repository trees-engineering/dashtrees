import { useState, useEffect } from 'react'
import { ChevronRight } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { AnimatedNumber } from './AnimatedNumber'
import type { GameStats, Achievement } from './gamification'

interface GameHomeTabProps {
  stats: GameStats | null
  achievements: Achievement[]
  loading: boolean
  onNavigate: (tab: string) => void
  onPostRole: () => void
  recruiterFilter: string
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 mb-3 text-[10px] font-black uppercase tracking-widest" style={{ color: '#fbbf24' }}>
      {children}
    </h2>
  )
}

// ── Atmospheric background: navy + light rays + center glow ───────
function SpaceBackground({ levelColor }: { levelColor: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #030c1e 0%, #071629 55%, #0b1e38 100%)' }} />
      <div
        className="absolute"
        style={{
          top: -100, left: '50%', transform: 'translateX(-50%)',
          width: 560, height: 560,
          background: `radial-gradient(ellipse at center, ${levelColor}18 0%, transparent 70%)`,
        }}
      />
      {Array.from({ length: 12 }, (_, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            top: 0, left: '50%',
            width: 1.5, height: '65%',
            transformOrigin: 'top center',
            transform: `translateX(-50%) rotate(${-110 + i * 20}deg)`,
            background: 'linear-gradient(180deg, rgba(80,160,255,0.10) 0%, transparent 100%)',
          }}
        />
      ))}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{ height: 160, background: 'linear-gradient(0deg, #080615 0%, transparent 100%)' }}
      />
    </div>
  )
}

// ── Left panel: XP progress + breakdown ──────────────────────────
function XPPanel({ stats }: { stats: GameStats }) {
  const { level, nextLevel, progressPct, totalXP } = stats
  return (
    <div
      className="flex-1 min-w-0 rounded-2xl p-3 flex flex-col gap-2.5"
      style={{ background: 'rgba(3,16,45,0.82)', border: '1px solid rgba(100,160,255,0.20)', backdropFilter: 'blur(10px)' }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-xl">⭐</span>
        <span className="font-black text-[11px] tracking-wide" style={{ color: '#fbbf24' }}>XP Points</span>
      </div>

      <div>
        <div className="flex items-center justify-between text-[10px] mb-1 flex-wrap gap-1">
          <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.65)' }}>
            {totalXP.toLocaleString()}
            {nextLevel && (
              <span style={{ color: '#fbbf24' }}> +{(totalXP - level.minXP).toLocaleString()}</span>
            )}
          </span>
          <span className="font-black" style={{ color: '#fbbf24' }}>{progressPct}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div
            style={{
              width: `${progressPct}%`, height: '100%',
              background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
              borderRadius: 999,
              boxShadow: '0 0 6px rgba(251,191,36,0.55)',
            }}
          />
        </div>
        {nextLevel && (
          <p className="text-[9px] mt-1" style={{ color: 'rgba(255,255,255,0.28)' }}>
            100% → <span style={{ color: nextLevel.color }}>{nextLevel.title}</span>
          </p>
        )}
      </div>

      <div className="space-y-1">
        {[
          { label: '🎯 Missions',   val: stats.rolesXP,   c: '#a78bfa' },
          { label: '📡 Scouting',   val: stats.matchesXP, c: '#34d399' },
          { label: '🤝 Placements', val: stats.introsXP,  c: '#60a5fa' },
        ].map(({ label, val, c }) => (
          <div key={label} className="flex items-center justify-between text-[10px]">
            <span style={{ color: 'rgba(255,255,255,0.38)' }}>{label}</span>
            <span style={{ color: c, fontWeight: 800 }}>+{val.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Center: diamond rank badge + star rating + title ──────────────
function RankBadge({ stats }: { stats: GameStats }) {
  const { level, progressPct, totalXP } = stats
  const filledStars = Math.floor(progressPct / 20)

  return (
    <div className="flex flex-col items-center gap-2 flex-shrink-0">
      {/* Trophy + total XP */}
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-xl">🏆</span>
        <span
          className="font-black text-base tabular-nums"
          style={{ color: '#fbbf24', textShadow: '0 0 10px rgba(251,191,36,0.6)' }}
        >
          <AnimatedNumber value={totalXP} />
        </span>
      </div>

      {/* Diamond badge */}
      <div className="relative flex items-center justify-center">
        <div
          className="absolute rounded-full"
          style={{ width: 110, height: 110, background: `radial-gradient(circle, ${level.color}22 0%, transparent 70%)` }}
        />
        <div
          style={{
            width: 80, height: 80,
            borderRadius: 18,
            transform: 'rotate(45deg)',
            background: `linear-gradient(135deg, ${level.color}28, rgba(0,8,28,0.92))`,
            border: `2px solid ${level.color}80`,
            boxShadow: `0 0 28px ${level.color}60, 0 0 56px ${level.color}20`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <span
            style={{
              transform: 'rotate(-45deg)', display: 'block',
              fontSize: 40, lineHeight: 1,
              filter: `drop-shadow(0 0 10px ${level.color})`,
            }}
          >
            {level.emoji}
          </span>
        </div>
      </div>

      {/* Stars */}
      <div className="flex gap-1">
        {[...Array(5)].map((_, i) => (
          <span
            key={i}
            style={{
              fontSize: 18,
              color: i < filledStars ? '#fbbf24' : 'rgba(255,255,255,0.12)',
              filter: i < filledStars ? 'drop-shadow(0 0 4px rgba(251,191,36,0.8))' : 'none',
            }}
          >
            ★
          </span>
        ))}
      </div>

      {/* Rank label */}
      <div className="text-center">
        <div
          className="font-black text-base leading-tight"
          style={{ color: level.color, textShadow: `0 0 14px ${level.color}80` }}
        >
          {level.title}
        </div>
        <div
          className="text-[10px] font-bold uppercase tracking-widest mt-0.5"
          style={{ color: 'rgba(255,255,255,0.30)' }}
        >
          Level {level.level}
        </div>
      </div>
    </div>
  )
}

// ── Right panel: Star Shield (intro progress + gem stats) ─────────
function ShieldPanel({ stats }: { stats: GameStats }) {
  const introTarget = Math.max(5, Math.ceil((stats.intros + 1) / 5) * 5)
  const introPct    = Math.min(100, Math.round((stats.intros / introTarget) * 100))

  return (
    <div
      className="flex-1 min-w-0 rounded-2xl p-3 flex flex-col gap-2.5"
      style={{ background: 'rgba(3,16,45,0.82)', border: '1px solid rgba(100,160,255,0.20)', backdropFilter: 'blur(10px)' }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-xl">🛡️</span>
        <span className="font-black text-[11px] tracking-wide" style={{ color: '#22d3ee' }}>Star Shield</span>
      </div>

      <div>
        <div className="flex items-center justify-between text-[10px] mb-1 flex-wrap gap-1">
          <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.65)' }}>{stats.intros}/{introTarget}</span>
          <span className="font-black" style={{ color: '#22d3ee' }}>{introPct}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div
            style={{
              width: `${introPct}%`, height: '100%',
              background: 'linear-gradient(90deg, #22d3ee, #0891b2)',
              borderRadius: 999,
              boxShadow: '0 0 6px rgba(34,211,238,0.55)',
            }}
          />
        </div>
        <p className="text-[9px] mt-1" style={{ color: 'rgba(255,255,255,0.28)' }}>
          Reach 100% to gain star protection!
        </p>
      </div>

      <div className="space-y-1">
        {[
          { label: '💎 Gems',        val: stats.gems,       c: '#22d3ee' },
          { label: '⭐ Stars',       val: stats.stars,      c: '#fbbf24' },
          { label: '🏆 Shortlisted', val: stats.shortlisted, c: '#34d399' },
        ].map(({ label, val, c }) => (
          <div key={label} className="flex items-center justify-between text-[10px]">
            <span style={{ color: 'rgba(255,255,255,0.38)' }}>{label}</span>
            <span style={{ color: c, fontWeight: 800 }}>{val.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Quest log ─────────────────────────────────────────────────────
interface Quest {
  id: string; title: string; description: string; emoji: string
  reward: string; rewardColor: string; action: string; tab: string
  completed?: boolean; completedLabel?: string
}

function QuestLog({
  stats,
  onNavigate,
  onPostRole,
}: {
  stats: GameStats
  onNavigate: (tab: string) => void
  onPostRole: () => void
}) {
  const quests: Quest[] = [
    { id: 'post_role',  title: 'Post a Mission',        description: 'Upload a job description to find the perfect candidate', emoji: '🎯', reward: '+100 XP',  rewardColor: '#a78bfa', action: 'Post Role',   tab: '__post_role', completed: stats.rolesTotal  >  0, completedLabel: `${stats.rolesTotal} posted`      },
    { id: 'shortlist',  title: 'Shortlist a Candidate',  description: 'Tick candidates from the Roster or Radar tab',          emoji: '⭐', reward: '+50 XP',   rewardColor: '#fbbf24', action: 'View Roster', tab: 'candidates',  completed: stats.shortlisted >  0, completedLabel: `${stats.shortlisted} shortlisted` },
    { id: 'intro',      title: 'Make an Introduction',   description: 'Connect a top candidate with a client',                  emoji: '🤝', reward: '+200 XP',  rewardColor: '#60a5fa', action: 'View Intros', tab: 'intros',      completed: stats.intros      >  0, completedLabel: `${stats.intros} made`            },
    { id: 'five_roles', title: 'Reach 5 Missions',       description: 'Post 5 roles to earn the Opportunity Maker badge',       emoji: '📋', reward: '+500 XP',  rewardColor: '#a78bfa', action: 'Post Role',   tab: '__post_role', completed: stats.rolesTotal  >= 5, completedLabel: `${stats.rolesTotal}/5`           },
    { id: 'ten_intros', title: 'Power Broker Goal',      description: 'Make 10 introductions for the Power Broker badge',       emoji: '💼', reward: '+1000 XP', rewardColor: '#60a5fa', action: 'View Intros', tab: 'intros',      completed: stats.intros      >= 10, completedLabel: `${stats.intros}/10`             },
  ]
  const active = quests.filter((q) => !q.completed)
  const done   = quests.filter((q) => q.completed)

  return (
    <div>
      <SectionLabel>📜 Active Quests</SectionLabel>
      <div className="space-y-2">
        {active.length === 0 && (
          <div
            className="rounded-xl p-4 text-center"
            style={{ background: 'rgba(3,16,45,0.70)', border: '1px solid rgba(251,191,36,0.22)' }}
          >
            <p className="text-sm font-semibold" style={{ color: '#fbbf24' }}>🏆 All quests complete — you're a legend!</p>
          </div>
        )}
        {active.map((quest, i) => (
          <div
            key={quest.id}
            className="rounded-xl flex items-center gap-3 px-3 py-2.5 game-slide-up"
            style={{
              background: 'rgba(3,16,45,0.70)',
              border: '1px solid rgba(100,160,255,0.14)',
              animationDelay: `${i * 60}ms`,
            }}
          >
            <span className="text-2xl flex-shrink-0">{quest.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white">{quest.title}</div>
              <div className="text-[10px] leading-tight mt-0.5" style={{ color: 'rgba(255,255,255,0.38)' }}>
                {quest.description}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <span className="text-[10px] font-black" style={{ color: quest.rewardColor }}>{quest.reward}</span>
              <button
                onClick={() => quest.tab === '__post_role' ? onPostRole() : onNavigate(quest.tab)}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black transition-all duration-150 hover:scale-105 active:scale-95"
                style={{ background: `${quest.rewardColor}20`, border: `1px solid ${quest.rewardColor}40`, color: quest.rewardColor }}
              >
                {quest.action} <ChevronRight size={10} />
              </button>
            </div>
          </div>
        ))}
        {done.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {done.map((quest) => (
              <div
                key={quest.id}
                className="rounded-xl flex items-center gap-3 px-3 py-2 opacity-40"
                style={{ background: 'rgba(3,16,45,0.50)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <span className="text-xl flex-shrink-0">{quest.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-400 line-through">{quest.title}</div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[9px] font-bold" style={{ color: '#34d399' }}>{quest.completedLabel}</span>
                  <span style={{ color: '#34d399' }}>✓</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Achievements grid ─────────────────────────────────────────────
const TIER_COLORS = {
  bronze: { bg: 'rgba(180,83,9,0.18)',    border: 'rgba(180,83,9,0.35)',   glow: '#b45309', text: '#fbbf24' },
  silver: { bg: 'rgba(100,116,139,0.18)', border: 'rgba(100,116,139,0.30)', glow: '#94a3b8', text: '#cbd5e1' },
  gold:   { bg: 'rgba(161,98,7,0.18)',    border: 'rgba(234,179,8,0.35)',  glow: '#eab308', text: '#fde047' },
}

function AchievementsGrid({ achievements }: { achievements: Achievement[] }) {
  const [showAll, setShowAll] = useState(false)
  const displayed   = showAll ? achievements : achievements.slice(0, 8)
  const unlockCount = achievements.filter((a) => a.unlocked).length

  return (
    <div>
      <SectionLabel>
        🏅 Achievements
        <span className="ml-auto text-[9px] font-bold normal-case tracking-normal" style={{ color: 'rgba(251,191,36,0.45)' }}>
          {unlockCount}/{achievements.length} unlocked
        </span>
      </SectionLabel>
      <div className="grid grid-cols-2 gap-2">
        {displayed.map((ach, i) => {
          const tier = TIER_COLORS[ach.tier]
          return (
            <div
              key={ach.id}
              className={`rounded-xl p-3 flex items-center gap-3 transition-all duration-200 ${ach.unlocked ? 'game-pop-in' : 'opacity-30 grayscale'}`}
              style={{
                background: ach.unlocked ? tier.bg : 'rgba(3,16,45,0.5)',
                border: `1px solid ${ach.unlocked ? tier.border : 'rgba(255,255,255,0.05)'}`,
                boxShadow: ach.unlocked ? `0 0 14px ${tier.glow}20` : 'none',
                animationDelay: ach.unlocked ? `${i * 50}ms` : '0ms',
              }}
            >
              <span
                className="text-2xl flex-shrink-0"
                style={{ filter: ach.unlocked ? `drop-shadow(0 0 6px ${tier.glow}80)` : 'none' }}
              >
                {ach.unlocked ? ach.icon : '🔒'}
              </span>
              <div className="min-w-0">
                <div className="text-xs font-black truncate" style={{ color: ach.unlocked ? tier.text : '#475569' }}>
                  {ach.title}
                </div>
                <div className="text-[9px] text-slate-500 truncate leading-tight mt-0.5">{ach.description}</div>
                {ach.unlocked && (
                  <div className="text-[9px] font-black mt-0.5" style={{ color: tier.glow }}>
                    +{ach.xpReward.toLocaleString()} XP
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {achievements.length > 8 && (
        <button
          onClick={() => setShowAll((s) => !s)}
          className="mt-2 w-full text-center text-[10px] font-semibold py-1 transition-colors"
          style={{ color: '#fbbf24' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#fde68a')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#fbbf24')}
        >
          {showAll ? '▲ Show less' : `▼ Show all ${achievements.length} achievements`}
        </button>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────
export function GameHomeTab({
  stats,
  achievements,
  loading,
  onNavigate,
  onPostRole,
}: GameHomeTabProps) {
  const { recruiter } = useAuth()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(id)
  }, [])

  if (loading || !stats || !recruiter) {
    return (
      <div className="p-4 space-y-3" style={{ background: '#030c1e' }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: 'rgba(100,160,255,0.06)' }} />
        ))}
      </div>
    )
  }

  if (!mounted) return null

  const displayName = recruiter.name ?? recruiter.email.split('@')[0]

  return (
    <div style={{ background: '#080615', minHeight: '100%' }}>

      {/* ── Hero section ──────────────────────────────────────── */}
      <div className="relative overflow-hidden pb-8">
        <SpaceBackground levelColor={stats.level.color} />

        <div className="relative z-10 px-4 pt-5">
          {/* Top bar */}
          <div className="flex items-start justify-between gap-3 mb-5">
            <div>
              <p
                className="text-[9px] font-black uppercase tracking-widest mb-0.5"
                style={{ color: 'rgba(255,255,255,0.32)' }}
              >
                Recruiter
              </p>
              <h1 className="text-white font-black text-xl leading-tight">{displayName}</h1>
            </div>
            {stats.nextLevel ? (
              <div
                className="rounded-xl px-3 py-2 text-right flex-shrink-0"
                style={{ background: 'rgba(3,16,45,0.82)', border: '1px solid rgba(100,160,255,0.22)' }}
              >
                <div
                  className="text-[9px] font-black uppercase tracking-wide mb-0.5"
                  style={{ color: '#60a5fa' }}
                >
                  Next Rank
                </div>
                <div className="font-black text-sm" style={{ color: stats.level.nextColor }}>
                  {stats.nextLevel.emoji} {stats.nextLevel.title}
                </div>
              </div>
            ) : (
              <div
                className="rounded-xl px-3 py-2 text-right flex-shrink-0"
                style={{ background: 'rgba(192,132,252,0.12)', border: '1px solid rgba(192,132,252,0.32)' }}
              >
                <div className="text-[9px] font-black uppercase tracking-wide" style={{ color: '#c084fc' }}>
                  ✦ Max Level
                </div>
                <div className="font-black text-sm text-white">Legend!</div>
              </div>
            )}
          </div>

          {/* 3-column rank display */}
          <div className="flex items-center gap-2 sm:gap-3">
            <XPPanel stats={stats} />
            <RankBadge stats={stats} />
            <ShieldPanel stats={stats} />
          </div>
        </div>
      </div>

      {/* ── Below-fold content ────────────────────────────────── */}
      <div className="px-4 pb-8 space-y-5">
        <QuestLog stats={stats} onNavigate={onNavigate} onPostRole={onPostRole} />
        <AchievementsGrid achievements={achievements} />
        <div className="h-4" />
      </div>
    </div>
  )
}
