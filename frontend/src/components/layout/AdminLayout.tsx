import {
  Outlet,
  Link,
  NavLink,
  useNavigate,
  useLocation,
} from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import {
  LayoutDashboard,
  Bell,
  PackagePlus,
  LayoutGrid,
  HandHeart,
  Truck,
  MessagesSquare,
  ChartNoAxesCombined,
  Workflow,
  Menu,
  X,
  LogOut,
  ArrowUpRight,
} from 'lucide-react'
import { api } from '@/lib/api'
import { getAdminToken, clearAdminToken } from '@/lib/adminSession'
import { assetUrl } from '@/lib/assets'
import {
  ADMIN_DATA_MODE_LABELS,
  normalizeAdminDataMode,
} from '@/lib/adminReadOnlyPolicy.mjs'
import '@/styles/admin.css'

const DEV_ADMIN_BYPASS = import.meta.env.VITE_DEV_ADMIN_BYPASS === 'true'
const ADMIN_DATA_MODE = normalizeAdminDataMode(
  import.meta.env.VITE_ADMIN_DATA_MODE,
)
const IS_LOCAL_REVIEW_HOST = ['localhost', '127.0.0.1', '::1'].includes(
  typeof window === 'undefined' ? '' : window.location.hostname,
)
const SHOW_REVIEW_MODE =
  IS_LOCAL_REVIEW_HOST &&
  (import.meta.env.DEV ||
    import.meta.env.VITE_ADMIN_LOCAL_QA === '1' ||
    import.meta.env.VITE_ADMIN_LIVE_READ_ONLY === '1')
const FIXTURE_REVIEW_URL =
  import.meta.env.VITE_ADMIN_FIXTURE_URL || 'http://127.0.0.1:3100/admin'
const LIVE_REVIEW_URL =
  import.meta.env.VITE_ADMIN_LIVE_URL || 'http://127.0.0.1:3200/admin'
const navigation = [
  { name: 'Overview', path: '/admin', icon: LayoutDashboard },
  { name: 'Notifications', path: '/admin/notifications', icon: Bell },
  { name: 'Drops', path: '/admin/donations', icon: PackagePlus },
  { name: 'Wall', path: '/admin/items', icon: LayoutGrid },
  { name: 'Claims', path: '/admin/item-requests', icon: HandHeart },
  { name: 'Deliveries', path: '/admin/orders', icon: Truck },
  { name: 'Support', path: '/admin/messages', icon: MessagesSquare },
  { name: 'Analytics', path: '/admin/analytics', icon: ChartNoAxesCombined },
  { name: 'Automations', path: '/admin/automations', icon: Workflow },
]
const tools = [
  { name: 'Bulk upload', path: '/admin/bulk-upload' },
  { name: 'Partner applications', path: '/admin/partners' },
  { name: 'Waitlist', path: '/admin/waitlist' },
  { name: 'Peer chats', path: '/admin/peer-chats' },
]
export function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [checked, setChecked] = useState(DEV_ADMIN_BYPASS)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const previousPath = useRef(location.pathname)
  const main = useRef<HTMLElement>(null)
  useEffect(() => {
    if (DEV_ADMIN_BYPASS) return
    let active = true
    if (!getAdminToken()) {
      navigate('/admin/login', { replace: true })
      return
    }
    api.admin
      .get('/api/auth/me')
      .then(() => {
        if (active) setChecked(true)
      })
      .catch(() => {
        if (active) {
          clearAdminToken()
          navigate('/admin/login', { replace: true })
        }
      })
    return () => {
      active = false
    }
  }, [navigate])
  useEffect(() => {
    setMobileNavOpen(false)
    if (previousPath.current !== location.pathname) main.current?.focus()
    previousPath.current = location.pathname
    const page = [...navigation, ...tools].find(
      (item) => item.path === location.pathname,
    )
    document.title = `${page?.name || 'Admin'} · Reloved Control Center`
  }, [location.pathname])
  if (!checked)
    return (
      <div className="admin-shell">
        <p role="status" className="admin-session">
          Checking admin session…
        </p>
      </div>
    )
  return (
    <div className="admin-shell">
      <a className="admin-skip" href="#admin-main">
        Skip to content
      </a>
      <aside
        className="admin-sidebar"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && mobileNavOpen) {
            setMobileNavOpen(false)
            menuButton.current?.focus()
          }
        }}
      >
        <div className="admin-brand-row">
          <Link
            to="/admin"
            className="admin-brand"
            aria-label="Reloved Control Center"
          >
            <img
              className="admin-brand-lockup"
              src={assetUrl('/images/reloved-wordmark-lockup.png')}
              alt="Reloved"
            />
            <span className="admin-eyebrow">Control Center</span>
          </Link>
          <button
            ref={menuButton}
            className="admin-menu-toggle admin-button"
            type="button"
            aria-controls="admin-navigation"
            aria-expanded={mobileNavOpen}
            aria-label={mobileNavOpen ? 'Close admin menu' : 'Open admin menu'}
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        <div
          id="admin-navigation"
          className={`admin-navigation ${mobileNavOpen ? 'is-open' : ''}`}
        >
          <nav aria-label="Admin navigation">
            {navigation.map(({ name, path, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                end={path === '/admin'}
                className={({ isActive }) =>
                  `admin-nav-link ${isActive ? 'is-active' : ''}`
                }
              >
                <Icon size={18} aria-hidden="true" />
                <span>{name}</span>
              </NavLink>
            ))}
          </nav>
          {ADMIN_DATA_MODE !== 'live-readonly' && (
            <nav className="admin-tools" aria-label="Admin tools">
              <p className="admin-eyebrow">Tools</p>
              {tools.map(({ name, path }) => (
                <NavLink key={path} to={path} className="admin-tool-link">
                  {name}
                  <ArrowUpRight size={14} aria-hidden="true" />
                </NavLink>
              ))}
            </nav>
          )}
          <div className="admin-sidebar-footer">
            {DEV_ADMIN_BYPASS && ADMIN_DATA_MODE !== 'live-readonly' && (
              <p className="admin-notice">Dev auth bypass active</p>
            )}
            <button
              type="button"
              className="admin-signout"
              onClick={() => {
                clearAdminToken()
                navigate('/admin/login')
              }}
            >
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main id="admin-main" ref={main} tabIndex={-1} className="admin-main">
        {SHOW_REVIEW_MODE && (
          <section
            className={`admin-review-mode is-${ADMIN_DATA_MODE}`}
            aria-label="Development data mode"
          >
            <div>
              <span>Data mode</span>
              <strong>
                {ADMIN_DATA_MODE === 'live-readonly'
                  ? 'LIVE READ-ONLY · PRODUCTION DATA'
                  : ADMIN_DATA_MODE_LABELS.fixture}
              </strong>
              {ADMIN_DATA_MODE === 'live-readonly' && (
                <small>
                  Authenticated admin view · full operational records · writes blocked locally
                </small>
              )}
            </div>
            <nav aria-label="Switch local review data mode">
              <a
                href={FIXTURE_REVIEW_URL}
                aria-current={ADMIN_DATA_MODE === 'fixture' ? 'page' : undefined}
              >
                Fixture
              </a>
              <a
                href={LIVE_REVIEW_URL}
                aria-current={
                  ADMIN_DATA_MODE === 'live-readonly' ? 'page' : undefined
                }
              >
                Live read-only
              </a>
            </nav>
          </section>
        )}
        <Outlet />
      </main>
    </div>
  )
}
