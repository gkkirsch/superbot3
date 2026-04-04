import { cn } from '@/lib/utils'
import type { HTMLAttributes } from 'react'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success'
}

const variants: Record<string, string> = {
  default: 'bg-sand/20 text-sand',
  secondary: 'bg-muted text-muted-foreground',
  destructive: 'bg-ember/20 text-ember',
  outline: 'border text-foreground',
  success: 'bg-moss/20 text-moss',
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        variants[variant],
        className
      )}
      {...props}
    />
  )
}
