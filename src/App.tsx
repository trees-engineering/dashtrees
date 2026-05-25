import { useState, useCallback } from 'react'
import { Home, Briefcase, Users, UserCheck, type LucideIcon } from 'lucide-react'
import { useRecruiters } from './hooks/useRecruiters'
import { HomeTab } from './components/HomeTab'
import { RolesTab } from './components/RolesTab'
import { MatchesTab } from './components/MatchesTab'
import { IntrosTab } from './components/IntrosTab'

type TabId = 'home' | 'roles' | 'matches' | 'intros'

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
]

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('home')
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [selectedRecruiter, setSelectedRecruiter] = useState<string>(
    () => localStorage.getItem(RECRUITER_STORAGE_KEY) ?? ''
  )
  const [quoteIndex, setQuoteIndex] = useState(0)

  const { data: recruiters } = useRecruiters()

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab)
    setQuoteIndex((i) => (i + 1) % FOOTER_QUOTES.length)
  }, [])

  const handleRecruiterChange = (email: string) => {
    setSelectedRecruiter(email)
    localStorage.setItem(RECRUITER_STORAGE_KEY, email)
  }

  const handleNavigateToRoles = (tab: string) => {
    handleTabChange(tab as TabId)
  }

  const handleViewMatches = (roleId: string) => {
    setSelectedRoleId(roleId)
    handleTabChange('matches')
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-treeBg">
      {/* Header */}
      <header className="flex-shrink-0 bg-treeSurface border-b border-treeBorder px-4 py-3 flex items-center gap-3 z-10 safe-top">
        {/* Brand mark — the official Trees Engineering wordmark (tree + "TREES ENGINEERING") */}
        <img
          src="/icons/Trees_logo.jpeg"
          alt="Trees Engineering"
          className="h-8 w-auto flex-shrink-0"
        />
        <span className="hidden sm:inline-flex flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 border border-primary/30 rounded-full px-2.5 py-1">
          Recruiter Workspace
        </span>

        <div className="flex-1" />

        {/* Recruiter filter */}
        <div className="flex-shrink-0">
          <select
            value={selectedRecruiter}
            onChange={(e) => handleRecruiterChange(e.target.value)}
            className="text-xs bg-treeBg border border-treeBorder text-treeText rounded-lg px-2 py-1.5 max-w-[130px] focus:outline-none focus:ring-1 focus:ring-primary/40 appearance-none"
          >
            <option value="">All recruiters</option>
            {(recruiters ?? []).map((r) => (
              <option key={r.id} value={r.email} className="bg-treeSurface text-treeText">
                {r.name ?? r.email}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Content area */}
      <main className="flex-1 overflow-y-auto">
        {activeTab === 'home' && (
          <HomeTab
            onNavigate={handleNavigateToRoles}
            recruiterFilter={selectedRecruiter}
          />
        )}
        {activeTab === 'roles' && (
          <RolesTab
            onViewMatches={handleViewMatches}
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
