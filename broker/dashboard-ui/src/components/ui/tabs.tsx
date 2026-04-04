import { cn } from '@/lib/utils'
import { createContext, useContext, useState, type ReactNode, type HTMLAttributes } from 'react'

const TabsContext = createContext<{ value: string; onChange: (v: string) => void }>({
  value: '',
  onChange: () => {},
})

interface TabsProps extends HTMLAttributes<HTMLDivElement> {
  value?: string
  defaultValue?: string
  onValueChange?: (v: string) => void
}

export function Tabs({ value: controlled, defaultValue = '', onValueChange, children, ...props }: TabsProps) {
  const [internal, setInternal] = useState(defaultValue)
  const value = controlled ?? internal
  const onChange = (v: string) => {
    setInternal(v)
    onValueChange?.(v)
  }
  return (
    <TabsContext.Provider value={{ value, onChange }}>
      <div {...props}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-1', className)}
      {...props}
    />
  )
}

interface TabsTriggerProps extends HTMLAttributes<HTMLButtonElement> {
  value: string
}

export function TabsTrigger({ value, className, ...props }: TabsTriggerProps) {
  const ctx = useContext(TabsContext)
  const active = ctx.value === value
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all',
        active ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
        className
      )}
      onClick={() => ctx.onChange(value)}
      {...props}
    />
  )
}

interface TabsContentProps extends HTMLAttributes<HTMLDivElement> {
  value: string
}

export function TabsContent({ value, className, ...props }: TabsContentProps) {
  const ctx = useContext(TabsContext)
  if (ctx.value !== value) return null
  return <div className={cn('mt-4', className)} {...props} />
}
