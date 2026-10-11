import { useState, type FormEvent } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useSession } from '../../app/contexts'
import { APP_PATHS, discoverPath } from '../../app/routes'
import { parseTokens } from '../../domain/tags'
import { SearchField } from '../ui/SearchField'
import { BrandMark } from './BrandMark'
import styles from './AppNavBar.module.css'

const NAV_ITEMS = [
  { to: APP_PATHS.discover, label: 'Discovery' },
  { to: APP_PATHS.community, label: 'Community' },
  { to: APP_PATHS.tag, label: 'Tag these songs' },
  { to: APP_PATHS.library, label: 'Library' },
]

export function AppNavBar() {
  const { username } = useSession()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const tokens = parseTokens(query)
    if (tokens.length > 0) {
      navigate(discoverPath({ tags: tokens }))
      setQuery('')
    }
  }

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <BrandMark to={APP_PATHS.landing} />
        </div>

        <form role="search" className={styles.search} onSubmit={handleSubmit}>
          <SearchField
            id="app-search"
            label="Search songs by tags"
            variant="pill"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </form>

        <nav aria-label="Main" className={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? `${styles.link} ${styles.active}` : styles.link
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <span className={styles.avatar} title={`Signed in as ${username}`}>
          <span aria-hidden="true">{username.charAt(0).toUpperCase()}</span>
          <span className="visually-hidden">Signed in as {username}</span>
        </span>
      </div>
    </header>
  )
}
