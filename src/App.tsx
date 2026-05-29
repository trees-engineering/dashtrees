import { useState, useCallback, useEffect } from 'react'
import { Home, Briefcase, Users, UserCheck, FileBarChart2, type LucideIcon } from 'lucide-react'
import { useRecruiters } from './hooks/useRecruiters'
import { HomeTab } from './components/HomeTab'
import { RolesTab } from './components/RolesTab'
import { MatchesTab } from './components/MatchesTab'
import { IntrosTab } from './components/IntrosTab'
import { ReportsTab } from './components/ReportsTab'
import { LoginScreen } from './components/LoginScreen'
import { NoAccessScreen } from './components/NoAccessScreen'
import { RoleEditScreen } from './components/RoleEditScreen'
import { UserMenu } from './components/UserMenu'
import { useToast } from './components/Toast'
import { useAuth } from './lib/auth'
import { startMatching } from './lib/api'
import { telemetry } from './lib/telemetry'

type TabId = 'home' | 'roles' | 'matches' | 'intros' | 'reports'

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

const NAV_ITEMS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'roles', label: 'Roles', icon: Briefcase },
  { id: 'matches', label: 'Matches', icon: Users },
  { id: 'intros', label: 'Intros', icon: UserCheck },
  { id: 'reports', label: 'Reports', icon: FileBarChart2 },
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

  return <Dashboard />
}

function Dashboard() {
  const { isAdmin, recruiter } = useAuth()
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<TabId>('home')
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  // Set right after a successful JD upload alongside editingRoleId. When the
  // recruiter saves the edit, this tells us to kick off matching. Cleared on
  // save-fired-matching OR on back-without-save (recruiter can rerun later).
  const [pendingCascadeRoleId, setPendingCascadeRoleId] = useState<string | null>(null)
  // Admins choose freely from a dropdown ("" = All recruiters); their pick
  // persists across reloads in localStorage. Non-admins don't have a
  // dropdown — their filter is always locked to their own email below.
  const [adminSelection, setAdminSelection] = useState<string>(
    () => (isAdmin ? localStorage.getItem(RECRUITER_STORAGE_KEY) ?? '' : '')
  )
  const selectedRecruiter = isAdmin ? adminSelection : recruiter?.email ?? ''
  const [quoteIndex, setQuoteIndex] = useState(0)

  const { data: recruiters } = useRecruiters()

  // Identify the recruiter to telemetry on boot + whenever the selection
  // changes. Empty string ("All recruiters") clears the identity.
  useEffect(() => {
    telemetry.identify(selectedRecruiter || null)
  }, [selectedRecruiter])

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
    setQuoteIndex((i) => (i + 1) % FOOTER_QUOTES.length)
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

  return (
    <div className="flex flex-col h-[100dvh] bg-treeBg">
      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-4 h-[50px] flex items-center gap-3 z-10">
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
            onUploadSuccess={handleUploadSuccess}
            recruiterFilter={selectedRecruiter}
          />
        )}
        {activeTab === 'roles' && (
          <RolesTab
            onViewMatches={handleViewMatches}
            onEditRole={setEditingRoleId}
            onUploadSuccess={handleUploadSuccess}
            recruiterFilter={selectedRecruiter}
          />
        )}
        {activeTab === 'matches' && (
          <MatchesTab
            selectedRoleId={selectedRoleId}
            onRoleChange={setSelectedRoleId}
            recruiterFilter={selectedRecruiter}
          />
        )}
        {activeTab === 'intros' && (
          <IntrosTab recruiterFilter={selectedRecruiter} />
        )}
        {activeTab === 'reports' && (
          <ReportsTab recruiterFilter={selectedRecruiter} />
        )}

        {/* Footer quote */}
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-treeTextSec italic opacity-70">
            {FOOTER_QUOTES[quoteIndex]}
          </p>
        </div>
      </main>

      {/* Bottom nav */}
      <nav className="flex-shrink-0 bg-treeSurface border-t border-treeBorder safe-bottom z-10">
        <div className="flex">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id
            return (
              <button
                key={id}
                onClick={() => handleTabChange(id)}
                className={`relative flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-colors min-h-[56px] ${
                  active ? 'text-primary' : 'text-treeTextSec'
                }`}
              >
                <Icon size={active ? 22 : 20} />
                <span
                  className={`text-[10px] font-medium leading-none ${
                    active ? 'text-primary' : 'text-treeTextSec'
                  }`}
                >
                  {label}
                </span>
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

export default App
