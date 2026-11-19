import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { WalletProvider } from './context/WalletContext'
import Layout from './components/Layout'
import KeyboardShortcuts from './components/KeyboardShortcuts'
import { ToastProvider } from './components/Toast'

const Connect = lazy(() => import('./pages/Connect'))
const VaultHome = lazy(() => import('./pages/VaultHome'))
const SetMandate = lazy(() => import('./pages/SetMandate'))
const Pay = lazy(() => import('./pages/Pay'))
const Activity = lazy(() => import('./pages/Activity'))
const Rescue = lazy(() => import('./pages/Rescue'))
const Bridge = lazy(() => import('./pages/Bridge'))
const Identity = lazy(() => import('./pages/Identity'))
const Simulate = lazy(() => import('./pages/Simulate'))
const Architecture = lazy(() => import('./pages/Architecture'))
const Proof = lazy(() => import('./pages/Proof'))

function RouteLoading() {
  return (
    <div className="flex min-h-[45vh] flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p className="text-xs text-nomos-muted">Loading page…</p>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <WalletProvider>
        <KeyboardShortcuts />
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Connect />} />
              <Route path="/vault" element={<VaultHome />} />
              <Route path="/mandate" element={<SetMandate />} />
              <Route path="/pay" element={<Pay />} />
              <Route path="/rescue" element={<Rescue />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/proof" element={<Proof />} />
              <Route path="/bridge" element={<Bridge />} />
              <Route path="/identity" element={<Identity />} />
              <Route path="/simulate" element={<Simulate />} />
              <Route path="/architecture" element={<Architecture />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </WalletProvider>
    </ToastProvider>
  )
}
