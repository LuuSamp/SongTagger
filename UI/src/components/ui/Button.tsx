import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import styles from './Button.module.css'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'
type ButtonSize = 'md' | 'lg'

interface StyleProps {
  variant?: ButtonVariant
  size?: ButtonSize
}

function classNames({ variant = 'primary', size = 'md' }: StyleProps, extra?: string): string {
  return [styles.button, styles[variant], styles[size], extra].filter(Boolean).join(' ')
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, StyleProps {
  busy?: boolean
  children: ReactNode
}

export function Button({
  variant,
  size,
  busy = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={classNames({ variant, size }, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {children}
    </button>
  )
}

interface ButtonLinkProps extends LinkProps, StyleProps {}

export function ButtonLink({ variant, size, className, ...rest }: ButtonLinkProps) {
  return <Link {...rest} className={classNames({ variant, size }, className)} />
}
