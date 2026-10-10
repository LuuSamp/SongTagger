import { Link } from 'react-router-dom'
import { discoverPath } from '../../app/routes'
import { TagChip } from '../../components/ui/TagChip'
import type { Vibe } from '../../config/vibes'
import { VibeArt } from './VibeArt'
import styles from './VibeHero.module.css'
import { vibeStyle } from './vibeStyle'

interface VibeHeroProps {
  vibes: readonly Vibe[]
  activeQuery: readonly string[]
}

export function VibeHero({ vibes, activeQuery }: VibeHeroProps) {
  return (
    <section className={styles.hero} aria-labelledby="vibe-hero-title">
      <h2 id="vibe-hero-title" className={styles.caption}>
        Music and identity interweave. Pick a vibe to start.
      </h2>
      <ul className={styles.panels}>
        {vibes.map((vibe) => {
          const active = activeQuery.length === 1 && activeQuery[0] === vibe.query
          return (
            <li
              key={vibe.id}
              className={styles.panel}
              style={vibeStyle(vibe)}
              data-active={active || undefined}
            >
              <VibeArt vibe={vibe} />
              <div className={styles.copy}>
                <h3 className={styles.title}>
                  <Link
                    to={discoverPath({ tags: [vibe.query] })}
                    className={styles.stretched}
                    aria-current={active ? 'true' : undefined}
                  >
                    {vibe.title}
                  </Link>
                </h3>
                <p className={styles.description}>{vibe.description}</p>
              </div>
              <ul className={styles.tags} aria-label={`${vibe.title} tags`}>
                {vibe.relatedTags.map((token) => (
                  <li key={token}>
                    <TagChip
                      label={token.replace(/-/g, ' ')}
                      tone={vibe.id === 'dreamy' ? 'onLight' : 'onDark'}
                      to={discoverPath({ tags: [token] })}
                    />
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
