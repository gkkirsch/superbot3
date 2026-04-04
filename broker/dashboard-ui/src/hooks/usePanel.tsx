import { createContext, useContext, useState, type ReactNode } from 'react'

type PanelContextType = {
  open: boolean
  toggle: () => void
  close: () => void
}

const PanelContext = createContext<PanelContextType>({ open: false, toggle: () => {}, close: () => {} })

export function PanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <PanelContext.Provider value={{ open, toggle: () => setOpen(o => !o), close: () => setOpen(false) }}>
      {children}
    </PanelContext.Provider>
  )
}

export function usePanel() {
  return useContext(PanelContext)
}
