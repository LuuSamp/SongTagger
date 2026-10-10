import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { TAG_KIND_LABELS } from '../../domain/tags'
import { TAG_KINDS, type TagKind, type TagWrite } from '../../domain/types'
import styles from './AddTagForm.module.css'

interface AddTagFormProps {
  onAdd: (tag: TagWrite) => Promise<boolean>
  error: string | null
  onDismissError: () => void
}

export function AddTagForm({ onAdd, error, onDismissError }: AddTagFormProps) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<TagKind>('feeling')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    }
  }, [open])

  function close() {
    setOpen(false)
    setName('')
    onDismissError()
    requestAnimationFrame(() => toggleRef.current?.focus())
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    const added = await onAdd({ kind, token: name })
    setBusy(false)
    if (added) {
      setName('')
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Escape') {
      close()
    }
  }

  return (
    <div className={styles.wrapper}>
      {open ? (
        <form
          className={styles.form}
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          aria-label="Add a tag"
        >
          <label className="visually-hidden" htmlFor="add-tag-kind">
            Tag kind
          </label>
          <select
            id="add-tag-kind"
            className={styles.select}
            value={kind}
            onChange={(event) => setKind(event.target.value as TagKind)}
          >
            {TAG_KINDS.map((value) => (
              <option key={value} value={value}>
                {TAG_KIND_LABELS[value]}
              </option>
            ))}
          </select>
          <label className="visually-hidden" htmlFor="add-tag-name">
            Tag name
          </label>
          <input
            ref={inputRef}
            id="add-tag-name"
            className={styles.input}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. sunny, late night, cello"
            maxLength={255}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'add-tag-error' : undefined}
          />
          <Button type="submit" busy={busy} disabled={!name.trim()}>
            Add
          </Button>
          <Button variant="ghost" onClick={close}>
            Done
          </Button>
        </form>
      ) : (
        <button
          ref={toggleRef}
          type="button"
          className={styles.toggle}
          onClick={() => setOpen(true)}
        >
          + Add tags
        </button>
      )}
      {error ? (
        <p id="add-tag-error" className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <p className={styles.hint}>Help others discover. Community tags fuel the platform.</p>
    </div>
  )
}
