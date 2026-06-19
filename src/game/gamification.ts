export interface GameLevel {
  level: number
  title: string
  emoji: string
  minXP: number
  maxXP: number
  color: string
  nextColor: string
}

export const LEVELS: GameLevel[] = [
  { level: 1, title: 'Rookie Scout',      emoji: '🔰', minXP: 0,     maxXP: 499,    color: '#94a3b8', nextColor: '#60a5fa' },
  { level: 2, title: 'Field Analyst',     emoji: '🔵', minXP: 500,   maxXP: 1499,   color: '#60a5fa', nextColor: '#4ade80' },
  { level: 3, title: 'Senior Recruiter',  emoji: '🌿', minXP: 1500,  maxXP: 3499,   color: '#4ade80', nextColor: '#facc15' },
  { level: 4, title: 'Talent Hunter',     emoji: '⚡', minXP: 3500,  maxXP: 6999,   color: '#facc15', nextColor: '#fb923c' },
  { level: 5, title: 'Placement Master',  emoji: '🔥', minXP: 7000,  maxXP: 12999,  color: '#fb923c', nextColor: '#c084fc' },
  { level: 6, title: 'Legend Headhunter', emoji: '👑', minXP: 13000, maxXP: Infinity, color: '#c084fc', nextColor: '#c084fc' },
]

export const XP_REWARDS = {
  role_created:       { xp: 100, label: '+100 XP',  emoji: '🎯', color: '#a78bfa' },
  candidate_added:    { xp: 75,  label: '+75 XP',   emoji: '📄', color: '#34d399' },
  match_shortlisted:  { xp: 50,  label: '+50 XP',   emoji: '⭐', color: '#fbbf24' },
  introduction_made:  { xp: 200, label: '+200 XP',  emoji: '🤝', color: '#60a5fa' },
}

export interface GameStats {
  totalXP: number
  level: GameLevel
  nextLevel: GameLevel | null
  progressPct: number
  xpToNextLevel: number
  stars: number
  gems: number
  rolesXP: number
  matchesXP: number
  introsXP: number
  achievementXP: number
  rolesTotal: number
  rolesOpen: number
  matchesTotal: number
  shortlisted: number
  intros: number
}

export function computeGameStats(
  rolesTotal: number,
  rolesOpen: number,
  matchesTotal: number,
  shortlisted: number,
  intros: number,
): GameStats {
  const rolesXP   = rolesTotal  * 100
  const matchesXP = matchesTotal * 10 + shortlisted * 50
  const introsXP  = intros * 200
  // Add XP from unlocked achievements so the displayed "+500 XP" badge actually counts
  const achievementXP = computeAchievements(rolesTotal, matchesTotal, shortlisted, intros)
    .filter((a) => a.unlocked)
    .reduce((s, a) => s + a.xpReward, 0)
  const totalXP   = rolesXP + matchesXP + introsXP + achievementXP

  const level = [...LEVELS].reverse().find((l) => totalXP >= l.minXP) ?? LEVELS[0]
  const levelIdx = LEVELS.indexOf(level)
  const nextLevel = levelIdx < LEVELS.length - 1 ? LEVELS[levelIdx + 1] : null

  const progressPct = nextLevel
    ? Math.min(100, Math.round(((totalXP - level.minXP) / (nextLevel.minXP - level.minXP)) * 100))
    : 100
  const xpToNextLevel = nextLevel ? nextLevel.minXP - totalXP : 0

  const stars = rolesTotal + Math.floor(shortlisted / 3) + intros * 2
  const gems  = Math.floor(matchesTotal / 5) + intros

  return {
    totalXP, level, nextLevel, progressPct, xpToNextLevel,
    stars, gems, rolesXP, matchesXP, introsXP, achievementXP,
    rolesTotal, rolesOpen, matchesTotal, shortlisted, intros,
  }
}

export interface Achievement {
  id: string
  title: string
  description: string
  icon: string
  unlocked: boolean
  xpReward: number
  tier: 'bronze' | 'silver' | 'gold'
}

export function computeAchievements(
  rolesTotal: number,
  matchesTotal: number,
  shortlisted: number,
  intros: number,
): Achievement[] {
  return [
    { id: 'first_role',    title: 'First Blood',       description: 'Post your first role',          icon: '🎯', unlocked: rolesTotal   >= 1,  xpReward: 100,  tier: 'bronze' },
    { id: 'five_roles',    title: 'Opportunity Maker',  description: 'Post 5 roles',                  icon: '📋', unlocked: rolesTotal   >= 5,  xpReward: 500,  tier: 'silver' },
    { id: 'ten_roles',     title: 'Role Factory',       description: 'Post 10 roles',                 icon: '🏗️', unlocked: rolesTotal   >= 10, xpReward: 1000, tier: 'gold'   },
    { id: 'first_match',   title: 'Talent Spotter',     description: 'Get your first match',          icon: '👁️', unlocked: matchesTotal >= 1,  xpReward: 50,   tier: 'bronze' },
    { id: 'ten_matches',   title: 'Scout',              description: 'Accumulate 10 matches',         icon: '🔍', unlocked: matchesTotal >= 10, xpReward: 200,  tier: 'silver' },
    { id: 'fifty_matches', title: 'Talent Magnet',      description: 'Accumulate 50 matches',         icon: '🧲', unlocked: matchesTotal >= 50, xpReward: 500,  tier: 'gold'   },
    { id: 'first_short',   title: 'Selective Eye',      description: 'Shortlist your first candidate',icon: '⭐', unlocked: shortlisted  >= 1,  xpReward: 75,   tier: 'bronze' },
    { id: 'ten_short',     title: 'Quality Picker',     description: 'Shortlist 10 candidates',       icon: '🏆', unlocked: shortlisted  >= 10, xpReward: 300,  tier: 'silver' },
    { id: 'first_intro',   title: 'Deal Maker',         description: 'Make your first introduction',  icon: '🤝', unlocked: intros        >= 1,  xpReward: 200,  tier: 'bronze' },
    { id: 'five_intros',   title: 'Connector',          description: 'Make 5 introductions',          icon: '⛓️', unlocked: intros        >= 5,  xpReward: 500,  tier: 'silver' },
    { id: 'ten_intros',    title: 'Power Broker',       description: 'Make 10 introductions',         icon: '💼', unlocked: intros        >= 10, xpReward: 1000, tier: 'gold'   },
    { id: 'twenty_intros', title: 'Legend',             description: 'Make 20 introductions',         icon: '👑', unlocked: intros        >= 20, xpReward: 2000, tier: 'gold'   },
  ]
}
