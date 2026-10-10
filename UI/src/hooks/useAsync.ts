import { useCallback, useEffect, useRef, useState } from 'react'

export type AsyncState<T> =
  | { status: 'idle'; data: null; error: null }
  | { status: 'loading'; data: T | null; error: null }
  | { status: 'success'; data: T; error: null }
  | { status: 'error'; data: null; error: Error }

export interface AsyncResource<T> {
  state: AsyncState<T>
  setData: (update: (current: T) => T) => void
  reload: () => void
}

const IDLE = { status: 'idle', data: null, error: null } as const

export function useAsync<T>(load: (() => Promise<T>) | null): AsyncResource<T> {
  const [state, setState] = useState<AsyncState<T>>(IDLE)
  const [version, setVersion] = useState(0)
  const requestRef = useRef(0)

  useEffect(() => {
    if (!load) {
      setState(IDLE)
      return
    }
    const request = ++requestRef.current
    setState((current) => ({ status: 'loading', data: current.data, error: null }))
    load().then(
      (data) => {
        if (request === requestRef.current) {
          setState({ status: 'success', data, error: null })
        }
      },
      (error: unknown) => {
        if (request === requestRef.current) {
          setState({
            status: 'error',
            data: null,
            error: error instanceof Error ? error : new Error(String(error)),
          })
        }
      },
    )
  }, [load, version])

  const setData = useCallback((update: (current: T) => T) => {
    setState((current) =>
      current.status === 'success' ? { ...current, data: update(current.data) } : current,
    )
  }, [])

  const reload = useCallback(() => setVersion((value) => value + 1), [])

  return { state, setData, reload }
}
