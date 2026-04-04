import { createContext, useContext, useState, type ReactNode } from 'react'

type PanelContextType = {
  open: boolean
  toggle: () => void
  close: () => void
}

const PanelContext = createContext<PanelContextType>({ open: false, toggle: () => {}, close: () => {} })

const STORAGE_KEY = 'superbot3-panel-open'

export function PanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === null ? true : stored === 'true'
  })
  const update = (next: boolean) => {
    setOpen(next)
    localStorage.setItem(STORAGE_KEY, String(next))
  }
  return (
    <PanelContext.Provider value={{ open, toggle: () => update(!open), close: () => update(false) }}>
      {children}
    </PanelContext.Provider>
  )
}

export function usePanel() {
  return useContext(PanelContext)
}
