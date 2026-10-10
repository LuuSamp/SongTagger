import { brandIcon } from './sourceBrands'

interface SourceIconProps {
  sourceName: string
  size?: number
}

export function SourceIcon({ sourceName, size = 18 }: SourceIconProps) {
  const icon = brandIcon(sourceName)
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      {icon ? (
        <path d={icon.path} fill="currentColor" />
      ) : (
        <path
          d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1m2 5a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}
