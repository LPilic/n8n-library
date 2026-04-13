import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '../lib/utils'

export interface SelectOption {
  value: string
  label: string
}

interface CustomSelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
  size?: 'sm' | 'md'
  id?: string
}

const sizeClasses = {
  sm: { trigger: 'text-xs px-2 py-1.5', option: 'text-xs px-2 py-1.5' },
  md: { trigger: 'text-sm px-3 py-1.5', option: 'text-sm px-3 py-1.5' },
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
  triggerClassName,
  size = 'md',
  id,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(-1)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, minWidth: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click — check both trigger wrapper and portal menu
  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node
      if (
        ref.current && !ref.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Position the portal menu relative to the trigger
  useLayoutEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setMenuPos({
        top: rect.bottom + 4,
        left: rect.left,
        minWidth: rect.width,
      })
    }
  }, [open])

  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value)
      setFocused(idx >= 0 ? idx : 0)
    }
  }, [open, options, value])

  useEffect(() => {
    if (open && menuRef.current && focused >= 0) {
      const item = menuRef.current.children[focused] as HTMLElement | undefined
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [focused, open])

  const select = useCallback(
    (v: string) => {
      onChange(v)
      setOpen(false)
    },
    [onChange],
  )

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (open && focused >= 0) {
          select(options[focused].value)
        } else {
          setOpen(true)
        }
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        break
      case 'ArrowDown':
        e.preventDefault()
        if (!open) { setOpen(true); break }
        setFocused((f) => Math.min(f + 1, options.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        if (!open) { setOpen(true); break }
        setFocused((f) => Math.max(f - 1, 0))
        break
    }
  }

  const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder ?? ''
  const sz = sizeClasses[size]

  const menu = open
    ? createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            minWidth: menuPos.minWidth,
            zIndex: 9999,
          }}
          className="w-max max-h-60 overflow-y-auto bg-card border border-border rounded-md shadow-lg py-1 dropdown-enter"
        >
          {options.map((o, i) => (
            <div
              key={o.value}
              onClick={() => select(o.value)}
              className={cn(
                'flex items-center justify-between gap-3 cursor-pointer',
                sz.option,
                'hover:bg-card-hover text-text-dark',
                i === focused && 'bg-card-hover',
              )}
            >
              <span className="truncate">{o.label}</span>
              {o.value === value && <Check size={12} className="shrink-0 text-primary" />}
            </div>
          ))}
        </div>,
        document.body,
      )
    : null

  return (
    <div className={cn('relative inline-block', className)} ref={ref}>
      <button
        type="button"
        ref={triggerRef}
        id={id}
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        onKeyDown={onKeyDown}
        className={cn(
          'flex items-center justify-between gap-2 border rounded-sm bg-input-bg text-text-dark border-input-border',
          'focus:outline-none focus:border-input-focus transition-colors',
          sz.trigger,
          disabled && 'opacity-60 cursor-not-allowed',
          triggerClassName,
        )}
      >
        <span className="truncate text-left">{selectedLabel}</span>
        <ChevronDown
          size={size === 'sm' ? 12 : 14}
          className={cn('shrink-0 transition-transform duration-150', open && 'rotate-180')}
        />
      </button>
      {menu}
    </div>
  )
}
