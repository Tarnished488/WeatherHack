import { NavLink, Outlet } from 'react-router-dom'

const LINKS = [
  { to: '/', label: '风险总览' },
  { to: '/trends', label: '趋势' },
  { to: '/alerts', label: '告警历史' },
  { to: '/transparency', label: '数据透明度' },
]

export function Layout() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold text-slate-900">MajiGuard</p>
            <p className="text-xs text-slate-500">社区用水压力风险与行动建议 · Conduit 观测决策支持</p>
          </div>
          <nav className="flex flex-wrap gap-1">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm ${
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
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
      <footer className="border-t border-slate-200 bg-white">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-slate-500">
          MajiGuard 提供可解释的用水压力提示，不输出水质、饮用水安全、精确灌溉或权威洪水结论，也不控制任何基础设施。
        </p>
      </footer>
    </div>
  )
}
