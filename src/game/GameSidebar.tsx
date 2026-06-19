import { X, type LucideIcon } from 'lucide-react'

export interface GameNavItem {
  id: string
  label: string
  icon: LucideIcon
  emoji: string
  xpHint?: string
}

interface GameSidebarProps {
  navItems: GameNavItem[]
  activeTab: string
  onSelect: (id: string) => void
  collapsed: boolean
  onToggleCollapse: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
}

export function GameSidebar({
  navItems,
  activeTab,
  onSelect,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: GameSidebarProps) {
  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/70 lg:hidden backdrop-blur-sm"
          onClick={onCloseMobile}
          aria-hidden
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 flex flex-col flex-shrink-0 transition-[width,transform] duration-200 ease-out w-56 ${
          collapsed ? 'lg:w-16' : 'lg:w-56'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
        style={{
          background: 'linear-gradient(180deg, #0f0b24 0%, #130e2e 100%)',
          borderRight: '1px solid rgba(139, 92, 246, 0.20)',
        }}
      >
        {/* Top bar */}
        <div
          className="h-[50px] flex items-center gap-2 px-3 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(139, 92, 246, 0.15)' }}
        >
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex items-center justify-center w-9 h-9 rounded-xl text-purple-400 hover:text-white transition-colors"
            style={{ background: 'rgba(139, 92, 246, 0.12)' }}
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
          >
            <span className="text-lg leading-none">🎮</span>
          </button>
          <button
            onClick={onCloseMobile}
            className="lg:hidden flex items-center justify-center w-9 h-9 rounded-xl text-purple-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
          {!collapsed && (
            <span className="text-[11px] font-black uppercase tracking-widest bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent lg:block">
              Game Mode
            </span>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
          {navItems.map(({ id, label, emoji, xpHint }) => {
            const active = activeTab === id
            return (
              <button
                key={id}
                onClick={() => onSelect(id)}
                title={collapsed ? label : undefined}
                className={`relative w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 transition-all duration-150 text-left ${
                  collapsed ? 'lg:justify-center lg:px-0' : ''
                } ${
                  active
                    ? 'text-white'
                    : 'text-purple-400 hover:text-purple-100'
                }`}
                style={
                  active
                    ? {
                        background:
                          'linear-gradient(135deg, rgba(139,92,246,0.30) 0%, rgba(79,70,229,0.20) 100%)',
                        border: '1px solid rgba(139,92,246,0.50)',
                        boxShadow: '0 0 16px rgba(139,92,246,0.25), inset 0 1px 0 rgba(255,255,255,0.05)',
                      }
                    : { background: 'transparent', border: '1px solid transparent' }
                }
              >
                {/* Emoji icon */}
                <span
                  className="text-base leading-none flex-shrink-0 transition-transform duration-150"
                  style={{ filter: active ? 'drop-shadow(0 0 6px rgba(255,255,255,0.4))' : 'none' }}
                >
                  {emoji}
                </span>

                {!collapsed && (
                  <div className="flex-1 flex items-center justify-between min-w-0">
                    <span className="text-sm font-semibold truncate">{label}</span>
                    {xpHint && (
                      <span
                        className="text-[9px] font-black ml-1 flex-shrink-0"
                        style={{ color: active ? '#a78bfa' : '#6b21a8' }}
                      >
                        {xpHint}
                      </span>
                    )}
                  </div>
                )}

                {/* Active indicator dot (collapsed mode) */}
                {active && collapsed && (
                  <span
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-1 h-4 rounded-full"
                    style={{ background: '#a78bfa' }}
                  />
                )}
              </button>
            )
          })}
        </nav>

        {/* Bottom footer */}
        {!collapsed && (
          <div
            className="p-3 text-center"
            style={{ borderTop: '1px solid rgba(139, 92, 246, 0.12)' }}
          >
            <p className="text-[9px] font-bold uppercase tracking-widest text-purple-700">
              ✦ Trees Engineering ✦
            </p>
          </div>
        )}
      </aside>
    </>
  )
}
