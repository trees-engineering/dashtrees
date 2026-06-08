import { Menu, X, type LucideIcon } from 'lucide-react'

interface NavItem {
  id: string
  label: string
  icon: LucideIcon
}

interface SidebarProps {
  navItems: NavItem[]
  activeTab: string
  onSelect: (id: string) => void
  /** Desktop only — icon-only rail (true) vs icon + label (false). */
  collapsed: boolean
  onToggleCollapse: () => void
  /** Mobile only — whether the off-canvas drawer is open. */
  mobileOpen: boolean
  onCloseMobile: () => void
}

/**
 * Left navigation.
 *  - Desktop (lg+): a persistent rail, collapsible between icon-only (w-16)
 *    and icon + label (w-60) via the hamburger at the top.
 *  - Mobile (< lg): an off-canvas drawer (always full-width / labelled) that
 *    slides in over a backdrop; the open trigger lives in the header.
 *
 * `collapsed` only takes effect at lg+ (the mobile drawer is always labelled),
 * so the width / label-hiding classes are all `lg:`-scoped.
 */
export function Sidebar({
  navItems,
  activeTab,
  onSelect,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-treeText/30 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 flex flex-col flex-shrink-0 bg-treeSurface border-r border-treeBorder transition-[width,transform] duration-200 ease-out w-60 ${
          collapsed ? 'lg:w-16' : 'lg:w-60'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        {/* Top bar — collapse toggle (desktop) / close (mobile) */}
        <div className="h-[50px] flex items-center gap-2 px-3 border-b border-treeBorder flex-shrink-0">
          <button
            data-telemetry-id="nav-collapse"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            className="hidden lg:flex items-center justify-center w-9 h-9 rounded-lg text-treeTextSec hover:text-treeText hover:bg-treeSurface2 transition-colors"
          >
            <Menu size={20} />
          </button>
          <button
            data-telemetry-id="nav-close-mobile"
            onClick={onCloseMobile}
            aria-label="Close menu"
            className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg text-treeTextSec hover:text-treeText hover:bg-treeSurface2 transition-colors"
          >
            <X size={20} />
          </button>
          <span
            className={`text-xs font-semibold uppercase tracking-wider text-treeTextSec ${
              collapsed ? 'lg:hidden' : ''
            }`}
          >
            Menu
          </span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-2">
          {navItems.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id
            return (
              <button
                key={id}
                data-telemetry-id={`nav-${id}`}
                onClick={() => onSelect(id)}
                title={collapsed ? label : undefined}
                className={`relative w-full flex items-center gap-3 px-4 py-2.5 transition-colors ${
                  collapsed ? 'lg:justify-center lg:px-0' : ''
                } ${
                  active
                    ? 'text-primary bg-primary/10 font-semibold'
                    : 'text-treeTextSec hover:text-treeText hover:bg-treeSurface2'
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-0.5 bg-primary rounded-r-full" />
                )}
                <Icon size={20} className="flex-shrink-0" />
                <span className={`text-sm ${collapsed ? 'lg:hidden' : ''}`}>{label}</span>
              </button>
            )
          })}
        </nav>
      </aside>
    </>
  )
}
