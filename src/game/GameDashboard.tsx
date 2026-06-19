import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Home, Briefcase, Users, UserCheck, FileBarChart2, UserCircle, Menu, BookUser, ClipboardList,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useToast } from '../components/Toast'
import { startMatching } from '../lib/api'
import { telemetry } from '../lib/telemetry'
import { RolesTab } from '../components/RolesTab'
import { MatchesTab } from '../components/MatchesTab'
import { CandidatesTab } from '../components/CandidatesTab'
import { TrackerTab } from '../components/TrackerTab'
import { IntrosTab } from '../components/IntrosTab'
import { ReportsTab } from '../components/ReportsTab'
import { ProfileTab } from '../components/ProfileTab'
import { RoleEditScreen } from '../components/RoleEditScreen'
import { NewRoleScreen } from '../components/NewRoleScreen'
import { CandidateEditScreen } from '../components/CandidateEditScreen'
import { NewCandidateScreen } from '../components/NewCandidateScreen'
import { UserMenu } from '../components/UserMenu'
import { GameHUD } from './GameHUD'
import { GameSidebar, type GameNavItem } from './GameSidebar'
import { GameHomeTab } from './GameHomeTab'
import { ScorePopOverlay, useScorePops } from './ScorePop'
import { useGameStats } from './useGameStats'
import { XP_REWARDS } from './gamification'

type GameTabId = 'home' | 'roles' | 'candidates' | 'matches' | 'tracker' | 'intros' | 'reports' | 'profile'

const GAME_NAV: GameNavItem[] = [
  { id: 'home',       label: 'Base Camp',  icon: Home,          emoji: '🏕️', xpHint: ''        },
  { id: 'roles',      label: 'Missions',   icon: Briefcase,     emoji: '🎯', xpHint: '+100 XP' },
  { id: 'candidates', label: 'Roster',     icon: BookUser,      emoji: '📋', xpHint: ''        },
  { id: 'matches',    label: 'Radar',      icon: Users,         emoji: '📡', xpHint: '+10 XP'  },
  { id: 'tracker',    label: 'Shortlist',  icon: ClipboardList, emoji: '🏆', xpHint: '+50 XP'  },
  { id: 'intros',     label: 'Intros',     icon: UserCheck,     emoji: '🤝', xpHint: '+200 XP' },
  { id: 'reports',    label: 'Intel',      icon: FileBarChart2, emoji: '📊', xpHint: ''        },
  { id: 'profile',    label: 'Player',     icon: UserCircle,    emoji: '👤', xpHint: ''        },
]

// Tab action banners shown as a thin banner above each tab's content
const TAB_BANNERS: Partial<Record<GameTabId, { emoji: string; text: string; color: string }>> = {
  roles:      { emoji: '🎯', text: 'Post a role to earn +100 XP • Shortlist for +50 XP',      color: '#a78bfa' },
  candidates: { emoji: '📋', text: 'Browse the full talent roster — tick candidates to shortlist them!', color: '#34d399' },
  matches:    { emoji: '📡', text: 'AI-matched candidates for your role — shortlist to earn +10 XP!',    color: '#34d399' },
  tracker:    { emoji: '🏆', text: 'Your shortlist — build the client doc and copy the email draft!',     color: '#f59e0b' },
  intros:     { emoji: '🤝', text: 'Every introduction earns +200 XP + 1 💎 gem!',                       color: '#60a5fa' },
}

export function GameDashboard() {
  const { recruiter, isAdmin } = useAuth()
  const toast = useToast()
  const { pops, addPop } = useScorePops()

  const [activeTab, setActiveTab] = useState<GameTabId>('home')
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [trackerRoleId, setTrackerRoleId] = useState('')
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [creatingRole, setCreatingRole] = useState(false)
  const [creatingCandidate, setCreatingCandidate] = useState(false)
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null)
  const [pendingCascadeRoleId, setPendingCascadeRoleId] = useState<string | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [navCollapsed, setNavCollapsed] = useState<boolean>(
    () => localStorage.getItem('trees_game_nav_collapsed') === '1',
  )
  const [adminSelection] = useState<string>(
    () => (isAdmin ? localStorage.getItem('trees_recruiter') ?? '' : ''),
  )
  const selectedRecruiter = isAdmin ? adminSelection : recruiter?.email ?? ''

  const { stats, achievements, isLoading } = useGameStats(selectedRecruiter)

  // Show a score pop whenever XP increases (data-driven feedback)
  const prevXP = useRef(0)
  useEffect(() => {
    if (!stats) return
    if (stats.totalXP > prevXP.current && prevXP.current !== 0) {
      const diff = stats.totalXP - prevXP.current
      addPop(`+${diff} XP`, '✨', '#a78bfa')
    }
    prevXP.current = stats.totalXP
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats?.totalXP])

  // Immediate shortlist pop — fires from useShortlist.onMutate without waiting
  // for the roles refetch to propagate the XP delta.
  useEffect(() => {
    const handler = () =>
      addPop(XP_REWARDS.match_shortlisted.label, XP_REWARDS.match_shortlisted.emoji, XP_REWARDS.match_shortlisted.color)
    window.addEventListener('game:shortlist_added', handler)
    return () => window.removeEventListener('game:shortlist_added', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleTabChange = useCallback((tab: GameTabId) => {
    setActiveTab(tab)
    setMobileNavOpen(false)
    telemetry.trackTab(`game_${tab}`)
  }, [])

  const toggleNavCollapsed = useCallback(() => {
    setNavCollapsed((c) => {
      const next = !c
      localStorage.setItem('trees_game_nav_collapsed', next ? '1' : '0')
      return next
    })
  }, [])

  const handleViewMatches = (roleId: string) => {
    setSelectedRoleId(roleId)
    handleTabChange('matches')
  }

  const handleUploadSuccess = (roleId: string) => {
    setPendingCascadeRoleId(roleId)
    setEditingRoleId(roleId)
  }

  const handleEditClose = () => {
    setEditingRoleId(null)
    setPendingCascadeRoleId(null)
  }

  const handleEditSaved = (roleId: string) => {
    if (roleId === pendingCascadeRoleId) {
      startMatching(roleId).catch((err) => console.error('[GameDash] start-matching:', err))
      toast.show('success', 'Matching started — candidates appear in ~1 min.')
      setPendingCascadeRoleId(null)
      // Immediate score pop for the role creation
      addPop(XP_REWARDS.role_created.label, XP_REWARDS.role_created.emoji, XP_REWARDS.role_created.color)
    }
    setEditingRoleId(null)
  }

  if (editingRoleId) {
    return (
      <>
        <ScorePopOverlay pops={pops} />
        <RoleEditScreen roleId={editingRoleId} onClose={handleEditClose} onSaved={handleEditSaved} />
      </>
    )
  }

  if (creatingRole) {
    return (
      <>
        <ScorePopOverlay pops={pops} />
        <NewRoleScreen
          recruiterFilter={selectedRecruiter}
          onClose={() => setCreatingRole(false)}
          onCreated={(roleId) => {
            setCreatingRole(false)
            handleUploadSuccess(roleId)
          }}
        />
      </>
    )
  }

  if (editingCandidateId) {
    return (
      <>
        <ScorePopOverlay pops={pops} />
        <CandidateEditScreen
          talentId={editingCandidateId}
          onClose={() => setEditingCandidateId(null)}
          onSaved={() => setEditingCandidateId(null)}
        />
      </>
    )
  }

  if (creatingCandidate) {
    return (
      <>
        <ScorePopOverlay pops={pops} />
        <NewCandidateScreen
          onClose={() => setCreatingCandidate(false)}
          onCreated={(talentId) => {
            setCreatingCandidate(false)
            setEditingCandidateId(talentId)
          }}
        />
      </>
    )
  }

  const banner = TAB_BANNERS[activeTab]

  return (
    <div
      className="flex h-[100dvh] overflow-hidden"
      style={{ background: '#080615', color: 'white' }}
    >
      <ScorePopOverlay pops={pops} />

      <GameSidebar
        navItems={GAME_NAV}
        activeTab={activeTab}
        onSelect={(id) => handleTabChange(id as GameTabId)}
        collapsed={navCollapsed}
        onToggleCollapse={toggleNavCollapsed}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex flex-col flex-1 min-w-0 h-full">
        {/* Game HUD — always-visible XP bar */}
        <GameHUD stats={stats} loading={isLoading} />

        {/* Header */}
        <header
          className="flex-shrink-0 h-[50px] flex items-center gap-3 px-4 z-10"
          style={{
            background: 'rgba(12,9,28,0.95)',
            borderBottom: '1px solid rgba(139,92,246,0.15)',
          }}
        >
          <button
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
            className="lg:hidden flex items-center justify-center w-9 h-9 -ml-1.5 flex-shrink-0 rounded-lg text-purple-400 hover:text-white transition-colors"
            style={{ background: 'rgba(139,92,246,0.10)' }}
          >
            <Menu size={20} />
          </button>

          <img src="/Trees.jpg" alt="Trees Engineering" className="h-8 w-auto flex-shrink-0 opacity-70" />

          <span
            className="hidden sm:inline-flex flex-shrink-0 items-center gap-1 text-[10px] font-black uppercase tracking-wider rounded-full px-2.5 py-1"
            style={{
              background: 'rgba(139,92,246,0.15)',
              border: '1px solid rgba(139,92,246,0.35)',
              color: '#a78bfa',
            }}
          >
            🎮 Game Mode
          </span>

          <div className="flex-1" />

          <a
            href="/"
            className="text-[11px] font-semibold transition-colors hidden sm:block"
            style={{ color: '#6b7280' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#e5e7eb')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
          >
            ← Normal View
          </a>

          <UserMenu />
        </header>

        {/* XP action banner for tabs that have rewards */}
        {banner && (
          <div
            className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5"
            style={{
              background: `${banner.color}08`,
              borderBottom: `1px solid ${banner.color}15`,
            }}
          >
            <span className="text-sm">{banner.emoji}</span>
            <p
              className="text-[10px] font-semibold flex-1"
              style={{ color: `${banner.color}cc` }}
            >
              {banner.text}
            </p>
          </div>
        )}

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          {activeTab === 'home' && (
            <GameHomeTab
              stats={stats}
              achievements={achievements}
              loading={isLoading}
              onNavigate={(tab) => handleTabChange(tab as GameTabId)}
              onPostRole={() => setCreatingRole(true)}
              recruiterFilter={selectedRecruiter}
            />
          )}

          {/* Existing tabs wrapped in a subtle dark overlay container */}
          {activeTab !== 'home' && activeTab !== 'profile' && (
            <div
              className="min-h-full"
              style={{
                background: 'linear-gradient(180deg, rgba(10,7,25,0.4) 0%, transparent 120px)',
              }}
            >
              {activeTab === 'roles' && (
                <RolesTab
                  onViewMatches={handleViewMatches}
                  onEditRole={setEditingRoleId}
                  onPostRole={() => setCreatingRole(true)}
                  onAddCandidate={() => setCreatingCandidate(true)}
                  recruiterFilter={selectedRecruiter}
                />
              )}
              {activeTab === 'candidates' && (
                <CandidatesTab
                  recruiterFilter={selectedRecruiter}
                  trackerRoleId={trackerRoleId}
                  onTrackerRoleChange={setTrackerRoleId}
                />
              )}
              {activeTab === 'matches' && (
                <MatchesTab
                  selectedRoleId={selectedRoleId}
                  onRoleChange={setSelectedRoleId}
                  recruiterFilter={selectedRecruiter}
                />
              )}
              {activeTab === 'tracker' && (
                <TrackerTab
                  recruiterFilter={selectedRecruiter}
                  trackerRoleId={trackerRoleId}
                  onTrackerRoleChange={setTrackerRoleId}
                />
              )}
              {activeTab === 'intros' && (
                <IntrosTab recruiterFilter={selectedRecruiter} />
              )}
              {activeTab === 'reports' && (
                <ReportsTab recruiterFilter={selectedRecruiter} />
              )}
            </div>
          )}

          {activeTab === 'profile' && <ProfileTab />}
        </main>
      </div>
    </div>
  )
}
