import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'dark' | 'light'

const ThemeContext = createContext<{
  theme: Theme
  toggle: () => void
}>({ theme: 'dark', toggle: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('superbot3-theme')
    return (stored === 'light' ? 'light' : 'dark') as Theme
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.classList.toggle('light', theme === 'light')
    localStorage.setItem('superbot3-theme', theme)
  }, [theme])

  const toggle = () => {
    // Disable transitions briefly so theme swap is instant
    document.documentElement.style.setProperty('--transition-override', 'none')
    document.documentElement.classList.add('no-transitions')
    setTheme(t => (t === 'dark' ? 'light' : 'dark'))
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.classList.remove('no-transitions')
        document.documentElement.style.removeProperty('--transition-override')
      })
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
