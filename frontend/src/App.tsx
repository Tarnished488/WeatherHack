import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AlertsPage } from './pages/Alerts'
import { DashboardPage } from './pages/Dashboard'
import { TransparencyPage } from './pages/Transparency'
import { TrendsPage } from './pages/Trends'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="trends" element={<TrendsPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="transparency" element={<TransparencyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
