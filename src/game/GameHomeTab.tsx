import { useState, useEffect } from 'react'
import { ChevronRight } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { AnimatedNumber } from './AnimatedNumber'
import type { GameStats, Achievement } from './gamification'
import { LEVELS } from './gamification'

interface GameHomeTabProps {
  stats: GameStats | null
  achievements: Achievement[]
  loading: boolean
  onNavigate: (tab: string) => void
  onPostRole: () => void
  recruiterFilter: string
}

function GlowCard({
  children,
  glowColor = 'rgba(139,92,246,0.20)',
  className = '',
}: {
  children: React.ReactNode
  glowColor?: string
  className?: string
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${className}`}
      style={{
        background: 'rgba(15,11,35,0.80)',
        borderColor: 'rgba(139,92,246,0.22)',
        boxShadow: `0 0 32px ${glowColor}, inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}
    >
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-black uppercase tracking-widest text-purple-400 mb-3 flex items-center gap-2">
      {children}
    </h2>
  )
}

function PlayerCard({ stats, recruiter }: { stats: GameStats; recruiter: { name?: string | null; email: string } }) {
  const displayName = recruiter.name ?? recruiter.email.split('@')[0]
  const initials = displayName.slice(0, 2).toUpperCase()
  const { level, nextLevel, progressPct, totalXP, xpToNextLevel } = stats

  return (
    <GlowCard glowColor={`${level.color}30`} className="overflow-hidden">
      {/* Background glow orb */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none rounded-2xl"
        style={{
          background: `radial-gradient(ellipse at 80% 20%, ${level.color}60 0%, transparent 60%)`,
        }}
      />

      <div className="relative flex items-start gap-4">
        {/* Avatar */}
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-black flex-shrink-0 game-pop-in"
          style={{
            background: `linear-gradient(135deg, ${level.color}40, ${level.color}15)`,
            border: `2px solid ${level.color}70`,
            boxShadow: `0 0 20px ${level.color}50`,
            color: level.color,
          }}
        >
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-base font-black text-white truncate">{displayName}</h1>
              <div
                className="inline-flex items-center gap-1.5 mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-black"
                style={{
                  background: `${level.color}20`,
                  border: `1px solid ${level.color}40`,
                  color: level.color,
                }}
              >
                <span>{level.emoji}</span>
                <span>Level {level.level} · {level.title}</span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-2xl font-black text-white tabular-nums">
                <AnimatedNumber value={totalXP} />
              </div>
              <div className="text-[9px] text-purple-400 uppercase tracking-wider font-bold">Total XP</div>
            </div>
          </div>

          {/* XP progress bar */}
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-slate-400 font-semibold">
                {progressPct}% to {nextLevel?.title ?? 'Max Level'}
              </span>
              {nextLevel && (
                <span className="text-[9px] text-slate-500">{xpToNextLevel.toLocaleString()} XP needed</span>
              )}
            </div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div
                className="h-full rounded-full game-xp-bar relative overflow-hidden"
                style={{
                  width: `${progressPct}%`,
                  background: `linear-gradient(90deg, ${level.color}, ${level.nextColor})`,
                  boxShadow: `0 0 8px ${level.color}80`,
                }}
              >
                <div className="absolute inset-0 game-shimmer-bar" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Level ladder mini-map */}
      <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-1">
        {LEVELS.map((lvl) => {
          const isCurrent = lvl.level === stats.level.level
          const isPast    = lvl.level < stats.level.level
          return (
            <div
              key={lvl.level}
              className="flex-1 min-w-[36px] flex flex-col items-center gap-1 transition-all duration-200"
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-all duration-200"
                style={{
                  background: isCurrent
                    ? `${lvl.color}30`
                    : isPast
                    ? `${lvl.color}15`
                    : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isCurrent ? lvl.color + '70' : isPast ? lvl.color + '30' : 'rgba(255,255,255,0.06)'}`,
                  boxShadow: isCurrent ? `0 0 12px ${lvl.color}50` : 'none',
                  opacity: isPast ? 0.6 : isCurrent ? 1 : 0.3,
                }}
                title={lvl.title}
              >
                {lvl.emoji}
              </div>
              <div
                className="text-[8px] font-bold text-center hidden sm:block"
                style={{ color: isCurrent ? lvl.color : isPast ? `${lvl.color}60` : 'rgba(255,255,255,0.15)' }}
              >
                {lvl.level}
              </div>
            </div>
          )
        })}
      </div>
    </GlowCard>
  )
}

function XPBreakdown({ stats }: { stats: GameStats }) {
  const sources = [
    {
      label: 'Missions',
      sublabel: 'Roles posted',
      emoji: '🎯',
      xp: stats.rolesXP,
      count: stats.rolesTotal,
      countLabel: 'roles',
      color: '#a78bfa',
      gradient: 'from-violet-900/40 to-purple-900/20',
    },
    {
      label: 'Scouting',
      sublabel: 'Matches & shortlists',
      emoji: '🔍',
      xp: stats.matchesXP,
      count: stats.matchesTotal,
      countLabel: 'matches',
      color: '#34d399',
      gradient: 'from-emerald-900/40 to-green-900/20',
    },
    {
      label: 'Placements',
      sublabel: 'Introductions made',
      emoji: '🤝',
      xp: stats.introsXP,
      count: stats.intros,
      countLabel: 'intros',
      color: '#60a5fa',
      gradient: 'from-blue-900/40 to-cyan-900/20',
    },
  ]

  return (
    <div>
      <SectionLabel>⚡ XP Breakdown</SectionLabel>
      <div className="grid grid-cols-3 gap-2">
        {sources.map((src, i) => (
          <div
            key={src.label}
            className={`rounded-xl border p-3 text-center game-slide-up`}
            style={{
              background: `rgba(15,11,35,0.80)`,
              borderColor: `${src.color}25`,
              boxShadow: `0 0 20px ${src.color}15`,
              animationDelay: `${i * 80}ms`,
            }}
          >
            <div className="text-xl mb-1">{src.emoji}</div>
            <div
              className="text-lg font-black tabular-nums"
              style={{ color: src.color }}
            >
              <AnimatedNumber value={src.xp} />
            </div>
            <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">{src.label}</div>
            <div className="text-[8px] text-slate-600 mt-0.5">
              {src.count} {src.countLabel}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface Quest {
  id: string
  title: string
  description: string
  emoji: string
  reward: string
  rewardColor: string
  action: string
  tab: string
  completed?: boolean
  completedLabel?: string
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
    {
      id: 'post_role',
      title: 'Post a Mission',
      description: 'Upload a job description to find the perfect candidate',
      emoji: '🎯',
      reward: '+100 XP',
      rewardColor: '#a78bfa',
      action: 'Post Role',
      tab: '__post_role',
      completed: stats.rolesTotal > 0,
      completedLabel: `${stats.rolesTotal} mission${stats.rolesTotal !== 1 ? 's' : ''} posted`,
    },
    {
      id: 'shortlist',
      title: 'Shortlist a Candidate',
      description: 'Review your matches and shortlist the best fits',
      emoji: '⭐',
      reward: '+50 XP',
      rewardColor: '#fbbf24',
      action: 'View Matches',
      tab: 'matches',
      completed: stats.shortlisted > 0,
      completedLabel: `${stats.shortlisted} shortlisted`,
    },
    {
      id: 'intro',
      title: 'Make an Introduction',
      description: 'Connect a top candidate with a client',
      emoji: '🤝',
      reward: '+200 XP',
      rewardColor: '#60a5fa',
      action: 'View Intros',
      tab: 'intros',
      completed: stats.intros > 0,
      completedLabel: `${stats.intros} intro${stats.intros !== 1 ? 's' : ''} made`,
    },
    {
      id: 'five_roles',
      title: 'Reach 5 Missions',
      description: 'Post 5 roles to earn the Opportunity Maker badge',
      emoji: '📋',
      reward: '+500 XP',
      rewardColor: '#a78bfa',
      action: 'Post Role',
      tab: '__post_role',
      completed: stats.rolesTotal >= 5,
      completedLabel: `${stats.rolesTotal}/5 roles`,
    },
    {
      id: 'ten_intros',
      title: 'Power Broker Goal',
      description: 'Make 10 introductions for the Power Broker badge',
      emoji: '💼',
      reward: '+1000 XP',
      rewardColor: '#60a5fa',
      action: 'View Intros',
      tab: 'intros',
      completed: stats.intros >= 10,
      completedLabel: `${stats.intros}/10 intros`,
    },
  ]

  const active = quests.filter((q) => !q.completed)
  const done   = quests.filter((q) => q.completed)

  return (
    <div>
      <SectionLabel>📜 Active Quests</SectionLabel>
      <div className="space-y-2">
        {active.length === 0 && (
          <GlowCard>
            <p className="text-center text-purple-300 text-sm font-semibold py-2">
              🏆 All quests complete — you're a legend!
            </p>
          </GlowCard>
        )}
        {active.map((quest, i) => (
          <div
            key={quest.id}
            className="rounded-xl border flex items-center gap-3 px-3 py-2.5 game-slide-up"
            style={{
              background: 'rgba(15,11,35,0.70)',
              borderColor: 'rgba(139,92,246,0.18)',
              animationDelay: `${i * 60}ms`,
            }}
          >
            <span className="text-2xl flex-shrink-0">{quest.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white">{quest.title}</div>
              <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{quest.description}</div>
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <span
                className="text-[10px] font-black"
                style={{ color: quest.rewardColor }}
              >
                {quest.reward}
              </span>
              <button
                onClick={() => {
                  if (quest.tab === '__post_role') onPostRole()
                  else onNavigate(quest.tab)
                }}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black transition-all duration-150 hover:scale-105 active:scale-95"
                style={{
                  background: `${quest.rewardColor}20`,
                  border: `1px solid ${quest.rewardColor}40`,
                  color: quest.rewardColor,
                }}
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
                className="rounded-xl border flex items-center gap-3 px-3 py-2 opacity-50"
                style={{
                  background: 'rgba(15,11,35,0.40)',
                  borderColor: 'rgba(255,255,255,0.06)',
                }}
              >
                <span className="text-xl flex-shrink-0">{quest.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-400 line-through">{quest.title}</div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[9px] text-emerald-400 font-bold">{quest.completedLabel}</span>
                  <span className="text-emerald-400 text-sm">✓</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const TIER_COLORS = {
  bronze: { bg: 'rgba(180,83,9,0.20)', border: 'rgba(180,83,9,0.35)', glow: '#b45309', text: '#fbbf24' },
  silver: { bg: 'rgba(100,116,139,0.20)', border: 'rgba(100,116,139,0.35)', glow: '#94a3b8', text: '#cbd5e1' },
  gold:   { bg: 'rgba(161,98,7,0.20)', border: 'rgba(234,179,8,0.35)', glow: '#eab308', text: '#fde047' },
}

function AchievementsGrid({ achievements }: { achievements: Achievement[] }) {
  const [showAll, setShowAll] = useState(false)
  const displayed = showAll ? achievements : achievements.slice(0, 8)
  const unlockCount = achievements.filter((a) => a.unlocked).length

  return (
    <div>
      <SectionLabel>
        🏅 Achievements
        <span className="ml-auto text-[9px] text-purple-500 font-bold normal-case tracking-normal">
          {unlockCount}/{achievements.length} unlocked
        </span>
      </SectionLabel>
      <div className="grid grid-cols-2 gap-2">
        {displayed.map((ach, i) => {
          const tier = TIER_COLORS[ach.tier]
          return (
            <div
              key={ach.id}
              className={`rounded-xl border p-3 flex items-center gap-3 transition-all duration-200 ${
                ach.unlocked ? 'game-pop-in' : 'opacity-30 grayscale'
              }`}
              style={{
                background: ach.unlocked ? tier.bg : 'rgba(15,11,35,0.5)',
                borderColor: ach.unlocked ? tier.border : 'rgba(255,255,255,0.06)',
                boxShadow: ach.unlocked ? `0 0 16px ${tier.glow}25` : 'none',
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
                <div
                  className="text-xs font-black truncate"
                  style={{ color: ach.unlocked ? tier.text : '#475569' }}
                >
                  {ach.title}
                </div>
                <div className="text-[9px] text-slate-500 truncate leading-tight mt-0.5">
                  {ach.description}
                </div>
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
          className="mt-2 w-full text-center text-[10px] text-purple-400 hover:text-purple-200 font-semibold py-1 transition-colors"
        >
          {showAll ? '▲ Show less' : `▼ Show all ${achievements.length} achievements`}
        </button>
      )}
    </div>
  )
}

function StatPill({
  emoji,
  value,
  label,
  color,
}: {
  emoji: string
  value: number
  label: string
  color: string
}) {
  return (
    <div
      className="flex-1 rounded-xl border text-center py-3 px-2"
      style={{
        background: `${color}10`,
        borderColor: `${color}25`,
      }}
    >
      <div className="text-xl">{emoji}</div>
      <div className="text-lg font-black tabular-nums mt-1" style={{ color }}>
        <AnimatedNumber value={value} />
      </div>
      <div className="text-[8px] text-slate-500 uppercase tracking-wide font-semibold mt-0.5">{label}</div>
    </div>
  )
}

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
      <div className="p-4 space-y-3">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-2xl animate-pulse"
            style={{ background: 'rgba(139,92,246,0.08)' }}
          />
        ))}
      </div>
    )
  }

  if (!mounted) return null

  return (
    <div
      className="p-4 space-y-5 min-h-full"
      style={{ background: 'linear-gradient(180deg, #0a0718 0%, #0d0a20 100%)' }}
    >
      {/* Player card */}
      <div className="relative">
        <PlayerCard stats={stats} recruiter={recruiter} />
      </div>

      {/* Quick stats row */}
      <div className="flex gap-2">
        <StatPill emoji="🎯" value={stats.rolesTotal}   label="Roles"     color="#a78bfa" />
        <StatPill emoji="🔍" value={stats.matchesTotal} label="Matches"    color="#34d399" />
        <StatPill emoji="⭐" value={stats.shortlisted}   label="Shortlisted" color="#fbbf24" />
        <StatPill emoji="🤝" value={stats.intros}       label="Intros"     color="#60a5fa" />
      </div>

      {/* XP breakdown */}
      <XPBreakdown stats={stats} />

      {/* Quest log */}
      <QuestLog stats={stats} onNavigate={onNavigate} onPostRole={onPostRole} />

      {/* Achievements */}
      <AchievementsGrid achievements={achievements} />

      {/* Bottom padding */}
      <div className="h-4" />
    </div>
  )
}
