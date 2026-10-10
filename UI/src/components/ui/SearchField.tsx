import { forwardRef, type InputHTMLAttributes } from 'react'
import styles from './SearchField.module.css'

interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  variant?: 'pill' | 'panel'
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { label, variant = 'panel', className, id, ...rest },
  ref,
) {
  const inputId = id ?? `search-${label.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <div className={[styles.field, styles[variant], className].filter(Boolean).join(' ')}>
      <label htmlFor={inputId} className="visually-hidden">
        {label}
      </label>
      <svg className={styles.icon} viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M13 13l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input ref={ref} id={inputId} type="search" className={styles.input} {...rest} />
    </div>
  )
})
