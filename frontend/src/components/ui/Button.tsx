import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  iconOnly?: boolean
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'secondary',
    size = 'md',
    loading = false,
    iconOnly = false,
    leadingIcon,
    trailingIcon,
    children,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'n8n-btn',
        `n8n-btn-${variant}`,
        size !== 'md' && `n8n-btn-${size}`,
        iconOnly && 'n8n-btn-icon',
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : leadingIcon}
      {!iconOnly && children}
      {!loading && trailingIcon}
    </button>
  )
})
