import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { TAG_KIND_LABELS } from '../../domain/tags'
import { TAG_KINDS, type TagKind, type TagWrite } from '../../domain/types'
import styles from './AddTagForm.module.css'

interface AddTagFormProps {
  id: string
  defaultKind: TagKind
  onAdd: (tag: TagWrite) => Promise<boolean>
  onClose: () => void
  error: string | null
}

export function AddTagForm({ id, defaultKind, onAdd, onClose, error }: AddTagFormProps) {
  const [kind, setKind] = useState<TagKind>(defaultKind)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

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
      event.preventDefault()
      onClose()
    }
  }

  return (
    <form
      id={id}
      className={styles.form}
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      aria-label="Add a tag"
    >
      <div className={styles.row}>
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
          aria-describedby={error ? 'add-tag-error' : 'add-tag-hint'}
        />
        <Button type="submit" busy={busy} disabled={!name.trim()}>
          Add
        </Button>
      </div>
      {error ? (
        <p id="add-tag-error" className={styles.error} role="alert">
          {error}
        </p>
      ) : (
        <p id="add-tag-hint" className={styles.hint}>
          Your tags help others find this song. Press Esc to close.
        </p>
      )}
    </form>
  )
}
