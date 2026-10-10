import { APP_PATHS } from '../app/routes'
import { PageShell } from '../components/layout/PageShell'
import { ButtonLink } from '../components/ui/Button'
import { StateMessage } from '../components/ui/StateMessage'

export function NotFoundPage() {
  return (
    <PageShell>
      <StateMessage
        title="Nothing plays at this address"
        description="The page you were looking for does not exist."
        action={
          <ButtonLink to={APP_PATHS.discover} variant="secondary">
            Back to Discovery
          </ButtonLink>
        }
      />
    </PageShell>
  )
}
