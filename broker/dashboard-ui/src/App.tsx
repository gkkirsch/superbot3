import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { Dashboard } from '@/pages/Dashboard'
import { SpaceDetail } from '@/pages/SpaceDetail'
import { CreateSpace } from '@/pages/CreateSpace'
import { useWebSocket } from '@/hooks/useWebSocket'
import { PanelProvider } from '@/hooks/usePanel'

function AppContent() {
  useWebSocket()
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/spaces/:slug" element={<SpaceDetail />} />
          <Route path="/create-space" element={<CreateSpace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <PanelProvider>
        <AppContent />
      </PanelProvider>
    </BrowserRouter>
  )
}
