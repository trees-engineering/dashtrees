import { useState, useCallback, useEffect } from 'react'
import { Home, Briefcase, Users, UserCheck, FileBarChart2, BarChart3, UserCircle, Menu, BookUser, ClipboardList, type LucideIcon } from 'lucide-react'
import { useRecruiters } from './hooks/useRecruiters'
import { Sidebar } from './components/Sidebar'
import { HomeTab } from './components/HomeTab'
import { RolesTab } from './components/RolesTab'
import { MatchesTab } from './components/MatchesTab'
import { IntrosTab } from './components/IntrosTab'
import { ReportsTab } from './components/ReportsTab'
import { AnalyticsTab } from './components/AnalyticsTab'
import { ProfileTab } from './components/ProfileTab'
import { LoginScreen } from './components/LoginScreen'
import { NoAccessScreen } from './components/NoAccessScreen'
import { RoleEditScreen } from './components/RoleEditScreen'
import { NewRoleScreen } from './components/NewRoleScreen'
import { CandidateEditScreen } from './components/CandidateEditScreen'
import { NewCandidateScreen } from './components/NewCandidateScreen'
import { CandidatesTab } from './components/CandidatesTab'
import { TrackerTab } from './components/TrackerTab'
import { UserMenu } from './components/UserMenu'
import { useToast } from './components/Toast'
import { useAuth } from './lib/auth'
import { startMatching } from './lib/api'
import { telemetry } from './lib/telemetry'
import { GameDashboard } from './game/GameDashboard'

const IS_GAME_ROUTE = window.location.pathname.startsWith('/game')

type TabId = 'home' | 'roles' | 'candidates' | 'matches' | 'tracker' | 'intros' | 'reports' | 'analytics' | 'profile'

const FOOTER_QUOTES = [
  '"Oil is found in the minds of men." — Wallace Pratt',
  '"The Stone Age didn\'t end because we ran out of stones." — Sheikh Yamani',
  '"Every barrel tells a story. We match the people who write them."',
  '"Drill where the talent is." — Trees wisdom',
  '"Good people are harder to find than reservoirs." — Anonymous driller',
  '"The best well is a well-matched candidate." — Trees proverb',
  '"Offshore or onshore, the right person is always the right call."',
  '"In recruitment as in drilling: depth matters." — Trees',
]

const RECRUITER_STORAGE_KEY = 'trees_recruiter'

// adminOnly items are filtered out for non-admins before render.
const NAV_ITEMS: { id: TabId; label: string; icon: LucideIcon; adminOnly?: boolean }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'roles', label: 'Roles', icon: Briefcase },
  { id: 'candidates', label: 'Candidates', icon: BookUser },
  { id: 'matches', label: 'Matches', icon: Users },
  { id: 'tracker', label: 'Tracker', icon: ClipboardList },
  { id: 'intros', label: 'Intros', icon: UserCheck },
  { id: 'reports', label: 'Reports', icon: FileBarChart2 },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, adminOnly: true },
  { id: 'profile', label: 'Profile', icon: UserCircle },
]

function App() {
  const auth = useAuth()

  if (auth.status === 'loading') {
    return (
      <div className="flex flex-col h-[100dvh] bg-treeBg items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (auth.status === 'unauthenticated') {
    return <LoginScreen />
  }
  if (auth.status === 'no-access') {
    return <NoAccessScreen email={auth.user?.email} />
  }

  if (IS_GAME_ROUTE) return <GameDashboard />
  return <Dashboard />
}

function Dashboard() {
  const { isAdmin, recruiter } = useAuth()
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<TabId>('home')
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [creatingRole, setCreatingRole] = useState(false)
  const [creatingCandidate, setCreatingCandidate] = useState(false)
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null)
  // Set right after a successful JD upload alongside editingRoleId. When the
  // recruiter saves the edit, this tells us to kick off matching. Cleared on
  // save-fired-matching OR on back-without-save (recruiter can rerun later).
  const [pendingCascadeRoleId, setPendingCascadeRoleId] = useState<string | null>(null)
  const [trackerRoleId, setTrackerRoleId] = useState('')
  const [trackerTalentIds, setTrackerTalentIds] = useState<Set<string>>(new Set())
  // Admins choose freely from a dropdown ("" = All recruiters); their pick
  // persists across reloads in localStorage. Non-admins don't have a
  // dropdown — their filter is always locked to their own email below.
  const [adminSelection, setAdminSelection] = useState<string>(
    () => (isAdmin ? localStorage.getItem(RECRUITER_STORAGE_KEY) ?? '' : '')
  )
  const selectedRecruiter = isAdmin ? adminSelection : recruiter?.email ?? ''
  const [quoteIndex, setQuoteIndex] = useState(0)
  // Left-nav UI state. `navCollapsed` is the desktop icon-only rail (persisted);
  // `mobileNavOpen` is the off-canvas drawer for small screens.
  const [navCollapsed, setNavCollapsed] = useState<boolean>(
    () => localStorage.getItem('trees_nav_collapsed') === '1'
  )
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const { data: recruiters } = useRecruiters()

  // Non-admins never see admin-only tabs (e.g. Analytics).
  const navItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin)

  // Identify telemetry to the *logged-in human*, not the header dropdown.
  // The dropdown is a view filter (it drives recruiterFilter below); using it
  // as the telemetry identity mis-stamped an admin's own clicks as whichever
  // recruiter they were inspecting. Admin events are excluded from analytics
  // server-side (analytics_overview JOINs _recruiters and drops is_admin rows).
  useEffect(() => {
    telemetry.identify(recruiter?.email ?? null)
  }, [recruiter?.email])

  // Emit the initial tab view once on mount so tab_time has a starting edge.
  useEffect(() => {
    telemetry.trackTab(activeTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab((prev) => {
      if (prev !== tab) telemetry.trackTab(tab)
      return tab
    })
    setMobileNavOpen(false) // close the mobile drawer after navigating
    setQuoteIndex((i) => (i + 1) % FOOTER_QUOTES.length)
  }, [])

  const toggleNavCollapsed = useCallback(() => {
    setNavCollapsed((c) => {
      const next = !c
      localStorage.setItem('trees_nav_collapsed', next ? '1' : '0')
      return next
    })
  }, [])

  const handleRecruiterChange = (email: string) => {
    // Admin-only — non-admins never see the dropdown that calls this.
    const prev = adminSelection
    setAdminSelection(email)
    localStorage.setItem(RECRUITER_STORAGE_KEY, email)
    telemetry.capture('recruiter_filter_changed', {
      from: prev || null,
      to: email || null,
    })
  }

  function handleTrackerRoleChange(roleId: string) {
    setTrackerRoleId(roleId)
    setTrackerTalentIds(new Set())
  }

  function handleTrackerToggle(talentId: string, forRoleId: string) {
    if (forRoleId !== trackerRoleId) {
      setTrackerRoleId(forRoleId)
      setTrackerTalentIds(new Set([talentId]))
    } else {
      setTrackerTalentIds(prev => {
        const next = new Set(prev)
        if (next.has(talentId)) next.delete(talentId)
        else next.add(talentId)
        return next
      })
    }
  }

  const handleNavigateToRoles = (tab: string) => {
    handleTabChange(tab as TabId)
  }

  const handleViewMatches = (roleId: string) => {
    telemetry.capture('view_matches_clicked', { role_id: roleId, from_tab: activeTab })
    setSelectedRoleId(roleId)
    handleTabChange('matches')
  }

  const handleUploadSuccess = (roleId: string) => {
    // Open the edit screen immediately so the recruiter can verify what the
    // LLM extracted. Matching is gated on their save.
    setPendingCascadeRoleId(roleId)
    setEditingRoleId(roleId)
  }

  const handleEditClose = () => {
    if (pendingCascadeRoleId) {
      // They bailed on a freshly-uploaded role without confirming. Don't
      // start matching — they can use Rerun Matching from the role accordion
      // when they're ready.
      telemetry.capture('role_confirm_skipped', { role_id: pendingCascadeRoleId })
    }
    setEditingRoleId(null)
    setPendingCascadeRoleId(null)
  }

  const handleEditSaved = (roleId: string) => {
    if (roleId === pendingCascadeRoleId) {
      // First save after upload — fire the cascade in the background and tell
      // the recruiter. Fire-and-forget; failures land in the server log.
      telemetry.capture('role_confirmed_matching_started', { role_id: roleId })
      startMatching(roleId).catch((err) => {
        console.error('[Dashboard] start-matching failed:', err)
      })
      toast.show('success', 'Matching started — candidates appear in ~1 min.')
      setPendingCascadeRoleId(null)
    }
    setEditingRoleId(null)
  }

  // Role editor takes over the whole viewport when active; tab + nav state
  // is preserved so closing the editor lands the user back where they were.
  if (editingRoleId) {
    return (
      <RoleEditScreen
        roleId={editingRoleId}
        onClose={handleEditClose}
        onSaved={handleEditSaved}
      />
    )
  }

  // New-role flow also takes over the viewport; on success it hands the new
  // role id to handleUploadSuccess, which opens the review/edit screen.
  if (creatingRole) {
    return (
      <NewRoleScreen
        recruiterFilter={selectedRecruiter}
        onClose={() => setCreatingRole(false)}
        onCreated={(roleId) => {
          setCreatingRole(false)
          handleUploadSuccess(roleId)
        }}
      />
    )
  }

  // Candidate edit screen — opens after upload or from future candidate list.
  if (editingCandidateId) {
    return (
      <CandidateEditScreen
        talentId={editingCandidateId}
        onClose={() => setEditingCandidateId(null)}
        onSaved={() => setEditingCandidateId(null)}
      />
    )
  }

  // New-candidate flow — full-screen upload/paste; on success opens the edit screen.
  if (creatingCandidate) {
    return (
      <NewCandidateScreen
        onClose={() => setCreatingCandidate(false)}
        onCreated={(talentId) => {
          setCreatingCandidate(false)
          setEditingCandidateId(talentId)
        }}
      />
    )
  }

  return (
    <div className="flex h-[100dvh] bg-treeBg overflow-hidden">
      <Sidebar
        navItems={navItems}
        activeTab={activeTab}
        onSelect={(id) => handleTabChange(id as TabId)}
        collapsed={navCollapsed}
        onToggleCollapse={toggleNavCollapsed}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex flex-col flex-1 min-w-0 h-full">
        {/* Header */}
        <header className="flex-shrink-0 bg-white border-b border-slate-200 px-4 h-[50px] flex items-center gap-3 z-10">
          {/* Mobile: open the nav drawer (desktop uses the persistent sidebar) */}
          <button
            data-telemetry-id="nav-open-mobile"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
            className="lg:hidden flex items-center justify-center w-9 h-9 -ml-1.5 flex-shrink-0 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          >
            <Menu size={20} />
          </button>

          {/* Brand mark — the official Trees Engineering wordmark (tree + "TREES ENGINEERING") */}
          <img
            src="/Trees.jpg"
            alt="Trees Engineering"
            className="h-10 w-auto flex-shrink-0"
          />
          <span className="hidden sm:inline-flex flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 border border-primary/30 rounded-full px-2.5 py-1">
            Trees Engineering Dashboard
          </span>

          <div className="flex-1" />

          <a
            href="/game"
            className="hidden sm:inline-flex flex-shrink-0 items-center gap-1 text-[10px] font-black uppercase tracking-wider rounded-full px-2.5 py-1 transition-all duration-150 hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(79,70,229,0.08))',
              border: '1px solid rgba(139,92,246,0.30)',
              color: '#a78bfa',
            }}
          >
            🎮 Game
          </a>

          {/* Recruiter filter — admins only. Non-admins are scoped to their
              own email automatically via useRoles/recruiterFilter. */}
          {isAdmin && (
            <div className="flex-shrink-0">
              <select
                value={selectedRecruiter}
                onChange={(e) => handleRecruiterChange(e.target.value)}
                className="text-xs bg-white border border-slate-300 text-slate-800 rounded-lg px-2 py-1.5 max-w-[130px] focus:outline-none focus:ring-1 focus:ring-primary/40 appearance-none"
              >
                <option value="">All recruiters</option>
                {(recruiters ?? []).map((r) => (
                  <option key={r.id} value={r.email} className="bg-white text-slate-800">
                    {r.name ?? r.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          <UserMenu />
        </header>

        {/* Content area */}
        <main className="flex-1 overflow-y-auto">
          {activeTab === 'home' && (
            <HomeTab
              onNavigate={handleNavigateToRoles}
              onPostRole={() => setCreatingRole(true)}
              onAddCandidate={() => setCreatingCandidate(true)}
              recruiterFilter={selectedRecruiter}
            />
          )}
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
              trackerTalentIds={trackerTalentIds}
              onTrackerRoleChange={handleTrackerRoleChange}
              onTrackerToggle={handleTrackerToggle}
            />
          )}
          {activeTab === 'matches' && (
            <MatchesTab
              selectedRoleId={selectedRoleId}
              onRoleChange={setSelectedRoleId}
              recruiterFilter={selectedRecruiter}
              trackerTalentIds={trackerTalentIds}
              onTrackerToggle={handleTrackerToggle}
            />
          )}
          {activeTab === 'tracker' && (
            <TrackerTab
              recruiterFilter={selectedRecruiter}
              trackerRoleId={trackerRoleId}
              trackerTalentIds={trackerTalentIds}
              onTrackerRoleChange={handleTrackerRoleChange}
            />
          )}
          {activeTab === 'intros' && (
            <IntrosTab recruiterFilter={selectedRecruiter} />
          )}
          {activeTab === 'reports' && (
            <ReportsTab recruiterFilter={selectedRecruiter} />
          )}
          {activeTab === 'analytics' && isAdmin && (
            <AnalyticsTab recruiterFilter={selectedRecruiter} />
          )}
          {activeTab === 'profile' && <ProfileTab />}

          {/* Footer quote */}
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-treeTextSec italic opacity-70">
              {FOOTER_QUOTES[quoteIndex]}
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
