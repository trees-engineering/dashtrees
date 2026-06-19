import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { getLeaderboard, type LeaderboardEntry } from '../lib/api'
import { ProfileTab } from '../components/ProfileTab'
import { LEVELS } from './gamification'
import type { GameStats } from './gamification'

function levelForXP(xp: number) {
  return [...LEVELS].reverse().find((l) => xp >= l.minXP) ?? LEVELS[0]
}

const MEDAL = ['#fbbf24', '#94a3b8', '#b45309'] // gold / silver / bronze

function RankRow({ entry, rank, isMe }: { entry: LeaderboardEntry; rank: number; isMe: boolean }) {
  const level = levelForXP(entry.totalXP)
  const name = entry.recruiter_name ?? entry.recruiter_email.split('@')[0]
  const medal = rank <= 3 ? MEDAL[rank - 1] : null

  return (
    <div
      className="flex items-center gap-3 rounded-xl px-3 py-2.5"
      style={{
        background: isMe ? `${level.color}12` : 'rgba(3,16,45,0.70)',
        border: `1px solid ${isMe ? level.color + '45' : 'rgba(100,160,255,0.12)'}`,
        boxShadow: isMe ? `0 0 18px ${level.color}18` : 'none',
      }}
    >
      {/* Position */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black"
        style={{
          background: medal ? `${medal}18` : 'rgba(255,255,255,0.05)',
          color: medal ?? 'rgba(255,255,255,0.30)',
          border: `1px solid ${medal ? medal + '40' : 'rgba(255,255,255,0.08)'}`,
        }}
      >
        {rank}
      </div>

      {/* Rank emoji */}
      <span
        className="text-xl flex-shrink-0"
        style={{ filter: `drop-shadow(0 0 5px ${level.color}60)` }}
      >
        {level.emoji}
      </span>

      {/* Name + level title */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-white truncate">{name}</span>
          {isMe && (
            <span
              className="text-[8px] font-black uppercase tracking-wider rounded-full px-1.5 py-0.5 flex-shrink-0"
              style={{ background: `${level.color}20`, color: level.color, border: `1px solid ${level.color}40` }}
            >
              YOU
            </span>
          )}
        </div>
        <div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.30)' }}>{level.title}</div>
      </div>

      {/* XP */}
      <div className="text-right flex-shrink-0">
        <div className="text-sm font-black" style={{ color: level.color }}>
          {entry.totalXP.toLocaleString()}
        </div>
        <div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.28)' }}>XP</div>
      </div>
    </div>
  )
}

export function GamePlayerTab({ stats }: { stats: GameStats | null }) {
  const { recruiter } = useAuth()
  const { data, isLoading } = useQuery({
    queryKey: ['gameLeaderboard'],
    queryFn: getLeaderboard,
    staleTime: 60 * 1000,
  })

  const leaderboard = data?.leaderboard ?? []
  const myEmail = recruiter?.email ?? ''
  const myRank = leaderboard.findIndex((e) => e.recruiter_email === myEmail) + 1

  return (
    <div style={{ background: '#080615', minHeight: '100%' }}>

      {/* Own rank banner */}
      {stats && (
        <div
          className="px-4 pt-5 pb-4"
          style={{
            background: `linear-gradient(180deg, ${stats.level.color}14 0%, transparent 100%)`,
            borderBottom: '1px solid rgba(100,160,255,0.09)',
          }}
        >
          <div className="flex items-center gap-4">
            {/* Diamond badge */}
            <div
              style={{
                width: 56, height: 56, borderRadius: 14, transform: 'rotate(45deg)', flexShrink: 0,
                background: `linear-gradient(135deg, ${stats.level.color}28, rgba(0,8,28,0.92))`,
                border: `2px solid ${stats.level.color}65`,
                boxShadow: `0 0 24px ${stats.level.color}45`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <span style={{ transform: 'rotate(-45deg)', fontSize: 30, lineHeight: 1 }}>
                {stats.level.emoji}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="font-black text-white text-lg leading-tight">{stats.level.title}</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.38)' }}>
                {stats.totalXP.toLocaleString()} XP · Level {stats.level.level}
                {myRank > 0 && (
                  <span style={{ color: stats.level.color }}> · #{myRank} on team</span>
                )}
              </div>
              {stats.nextLevel && (
                <div className="text-[9px] mt-1" style={{ color: 'rgba(255,255,255,0.22)' }}>
                  {stats.xpToNextLevel.toLocaleString()} XP to{' '}
                  <span style={{ color: stats.nextLevel.color }}>{stats.nextLevel.title}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div className="px-4 pt-5 pb-4">
        <h2
          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest mb-3"
          style={{ color: '#fbbf24' }}
        >
          🏆 Team Leaderboard
        </h2>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-12 rounded-xl animate-pulse"
                style={{ background: 'rgba(100,160,255,0.06)' }}
              />
            ))}
          </div>
        ) : leaderboard.length === 0 ? (
          <div
            className="rounded-xl p-4 text-center"
            style={{ background: 'rgba(3,16,45,0.70)', border: '1px solid rgba(100,160,255,0.14)' }}
          >
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.38)' }}>No leaderboard data yet</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {leaderboard.map((entry, i) => (
              <RankRow
                key={entry.recruiter_id}
                entry={entry}
                rank={i + 1}
                isMe={entry.recruiter_email === myEmail}
              />
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(100,160,255,0.09)', margin: '0 16px' }} />

      {/* Profile form */}
      <ProfileTab />
    </div>
  )
}
