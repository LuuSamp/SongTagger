import { useCallback, useLayoutEffect, useRef } from 'react'

export interface FlipList<K> {
  listRef: (element: HTMLElement | null) => void
  itemRef: (key: K) => (element: HTMLElement | null) => void
  getItem: (key: K) => HTMLElement | undefined
  capture: () => void
}

export function useFlipList<K>(keys: readonly K[]): FlipList<K> {
  const list = useRef<HTMLElement | null>(null)
  const items = useRef(new Map<K, HTMLElement>())
  const tops = useRef(new Map<K, number>())
  const lastOrder = useRef<string | null>(null)
  const refCallbacks = useRef(new Map<K, (element: HTMLElement | null) => void>())

  const listRef = useCallback((element: HTMLElement | null) => {
    list.current = element
  }, [])

  const itemRef = useCallback((key: K) => {
    let callback = refCallbacks.current.get(key)
    if (!callback) {
      callback = (element: HTMLElement | null) => {
        if (element) {
          items.current.set(key, element)
        } else {
          items.current.delete(key)
          tops.current.delete(key)
        }
      }
      refCallbacks.current.set(key, callback)
    }
    return callback
  }, [])

  const getItem = useCallback((key: K) => items.current.get(key), [])

  const capture = useCallback(() => {
    const listTop = list.current?.getBoundingClientRect().top ?? 0
    for (const [key, element] of items.current) {
      tops.current.set(key, element.getBoundingClientRect().top - listTop)
    }
  }, [])

  const order = keys.map(String).join('|')

  useLayoutEffect(() => {
    const changed = lastOrder.current !== null && lastOrder.current !== order
    lastOrder.current = order
    const moved: HTMLElement[] = []

    for (const [key, element] of items.current) {
      const top = element.offsetTop
      const previous = tops.current.get(key)
      tops.current.set(key, top)
      if (!changed) {
        continue
      }
      element.style.transition = 'none'
      element.style.transform =
        previous === undefined || Math.abs(previous - top) < 0.5
          ? ''
          : `translateY(${previous - top}px)`
      moved.push(element)
    }

    if (moved.length === 0) {
      return
    }
    void list.current?.offsetHeight
    const frame = requestAnimationFrame(() => {
      for (const element of moved) {
        element.style.transition = ''
        element.style.transform = ''
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [order])

  return { listRef, itemRef, getItem, capture }
}
