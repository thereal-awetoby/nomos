import { Routes, Route, Navigate } from 'react-router-dom'
import { WalletProvider } from './context/WalletContext'
import Layout from './components/Layout'
import Connect from './pages/Connect'
import VaultHome from './pages/VaultHome'
import SetMandate from './pages/SetMandate'
import Pay from './pages/Pay'
import Activity from './pages/Activity'
import Rescue from './pages/Rescue'
import Bridge from './pages/Bridge'

export default function App() {
  return (
    <WalletProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Connect />} />
          <Route path="/vault" element={<VaultHome />} />
          <Route path="/mandate" element={<SetMandate />} />
          <Route path="/pay" element={<Pay />} />
          <Route path="/rescue" element={<Rescue />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/bridge" element={<Bridge />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </WalletProvider>
  )
}
