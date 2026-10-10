import styles from './OrganicBackdrop.module.css'

export function OrganicBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <svg className={styles.right} viewBox="0 0 400 900" preserveAspectRatio="none">
        <path
          d="M260 0C330 120 190 210 250 340C310 470 400 470 400 470V0Z"
          fill="var(--color-sand)"
          opacity="0.55"
        />
        <path
          d="M400 380C300 420 250 520 300 640C350 760 280 840 330 900H400Z"
          fill="var(--color-accent)"
          opacity="0.35"
        />
      </svg>
      <svg className={styles.sun} viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="26" fill="var(--color-sun)" opacity="0.8" />
        {Array.from({ length: 12 }, (_, index) => {
          const angle = (index * Math.PI) / 6
          const x1 = 60 + Math.cos(angle) * 36
          const y1 = 60 + Math.sin(angle) * 36
          const x2 = 60 + Math.cos(angle) * 48
          const y2 = 60 + Math.sin(angle) * 48
          return (
            <line
              key={index}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--color-sun)"
              strokeWidth="4"
              strokeLinecap="round"
              opacity="0.7"
            />
          )
        })}
      </svg>
      <svg className={styles.left} viewBox="0 0 200 400" preserveAspectRatio="none">
        <path
          d="M0 40C90 70 120 160 70 230C30 290 60 360 0 400Z"
          fill="var(--color-accent)"
          opacity="0.28"
        />
      </svg>
    </div>
  )
}
