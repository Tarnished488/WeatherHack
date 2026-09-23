import { NavLink, Outlet } from 'react-router-dom'

const LINKS = [
  { to: '/', label: 'Overview' },
  { to: '/trends', label: 'Trends' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/transparency', label: 'Transparency' },
]

export function Layout() {
  return (
    <div className="paper-canvas flex min-h-svh flex-col">
      <header className="sticky top-0 z-10 border-b border-amber-900/15 bg-[#fffaf0]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-600 to-stone-800 text-white shadow-lg shadow-amber-900/20">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M12 2v6M12 22a7 7 0 0 0 7-7c0-4-4-9-7-13-3 4-7 9-7 13a7 7 0 0 0 7 7z"/>
              </svg>
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight text-slate-900">MajiGuard</p>
              <p className="text-xs text-slate-500">Water-use early warning · Kenya monitoring network</p>
            </div>
          </div>
          <nav className="flex flex-wrap gap-1 rounded-xl border border-amber-900/15 bg-[#fffaf0]/65 p-1 backdrop-blur">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) =>
                  `rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-amber-700 to-stone-800 text-white shadow-md shadow-amber-900/20'
                      : 'text-stone-600 hover:bg-amber-100/50 hover:text-stone-900'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-amber-900/15 bg-[#fffaf0]/55 backdrop-blur">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-slate-500">
          MajiGuard provides interpretable water-use early warnings. It does not assess water quality or potability, prescribe precise irrigation volumes, issue authoritative flood forecasts, or control infrastructure.
        </p>
      </footer>
    </div>
  )
}
