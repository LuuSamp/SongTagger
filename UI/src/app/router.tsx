import { createBrowserRouter } from 'react-router-dom'
import { CommunityPage } from '../pages/CommunityPage'
import { DiscoverPage } from '../pages/DiscoverPage'
import { LandingPage } from '../pages/LandingPage'
import { LibraryPage } from '../pages/LibraryPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { SongPage } from '../pages/SongPage'
import { RootLayout } from './RootLayout'
import { APP_PATHS } from './routes'

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: APP_PATHS.landing, element: <LandingPage /> },
      { path: APP_PATHS.discover, element: <DiscoverPage /> },
      { path: APP_PATHS.community, element: <CommunityPage /> },
      { path: APP_PATHS.library, element: <LibraryPage /> },
      { path: '/songs/:songId', element: <SongPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
