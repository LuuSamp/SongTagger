import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'

const DRAG_THRESHOLD = 4
const EDGE_ZONE = 64
const MAX_SCROLL_STEP = 14

interface Slot {
  top: number
  height: number
}

interface DragSession<K> {
  key: K
  fromIndex: number
  overIndex: number
  pointerId: number
  startPageY: number
  clientY: number
  slots: Slot[]
  step: number
  started: boolean
}

export interface SortableDragOptions<K> {
  keys: readonly K[]
  getItem: (key: K) => HTMLElement | undefined
  disabled: boolean
  beforeDrop: () => void
  onDrop: (key: K, toIndex: number) => void
}

export interface HandleProps {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onPointerMove: (event: PointerEvent<HTMLElement>) => void
  onPointerUp: (event: PointerEvent<HTMLElement>) => void
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void
}

export function useSortableDrag<K>(options: SortableDragOptions<K>) {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const session = useRef<DragSession<K> | null>(null)
  const scrollFrame = useRef<number | null>(null)
  const [draggingKey, setDraggingKey] = useState<K | null>(null)

  const elements = useCallback(
    () => optionsRef.current.keys.map((key) => optionsRef.current.getItem(key)),
    [],
  )

  const layout = useCallback(() => {
    const current = session.current
    if (!current) {
      return
    }
    const { fromIndex, slots, step } = current
    const dragged = slots[fromIndex]
    if (!dragged) {
      return
    }
    const offset = current.clientY + window.scrollY - current.startPageY
    const center = dragged.top + offset + dragged.height / 2

    let overIndex = fromIndex
    for (let index = fromIndex + 1; index < slots.length; index += 1) {
      const slot = slots[index]
      if (slot && center > slot.top + slot.height / 2) {
        overIndex = index
      }
    }
    for (let index = fromIndex - 1; index >= 0; index -= 1) {
      const slot = slots[index]
      if (slot && center < slot.top + slot.height / 2) {
        overIndex = index
      }
    }
    current.overIndex = overIndex

    elements().forEach((element, index) => {
      if (!element) {
        return
      }
      if (index === fromIndex) {
        element.style.transition = 'none'
        element.style.transform = `translateY(${offset}px)`
        return
      }
      let shift = 0
      if (fromIndex < overIndex && index > fromIndex && index <= overIndex) {
        shift = -step
      } else if (overIndex < fromIndex && index >= overIndex && index < fromIndex) {
        shift = step
      }
      element.style.transform = shift ? `translateY(${shift}px)` : ''
    })
  }, [elements])

  const stopAutoScroll = useCallback(() => {
    if (scrollFrame.current !== null) {
      cancelAnimationFrame(scrollFrame.current)
      scrollFrame.current = null
    }
  }, [])

  const autoScroll = useCallback(() => {
    const current = session.current
    if (!current?.started) {
      scrollFrame.current = null
      return
    }
    const { clientY } = current
    let delta = 0
    if (clientY < EDGE_ZONE) {
      delta = -Math.ceil(((EDGE_ZONE - clientY) / EDGE_ZONE) * MAX_SCROLL_STEP)
    } else if (clientY > window.innerHeight - EDGE_ZONE) {
      delta = Math.ceil(
        ((clientY - (window.innerHeight - EDGE_ZONE)) / EDGE_ZONE) * MAX_SCROLL_STEP,
      )
    }
    if (delta !== 0) {
      window.scrollBy(0, delta)
      layout()
    }
    scrollFrame.current = requestAnimationFrame(autoScroll)
  }, [layout])

  const finish = useCallback(
    (commit: boolean) => {
      const current = session.current
      session.current = null
      stopAutoScroll()
      document.body.style.removeProperty('user-select')
      if (!current?.started) {
        return
      }
      const { key, fromIndex, overIndex } = current
      const willMove = commit && overIndex !== fromIndex
      if (willMove) {
        optionsRef.current.beforeDrop()
      }
      elements().forEach((element) => {
        if (!element) {
          return
        }
        element.style.transition = willMove ? 'none' : ''
        element.style.transform = ''
      })
      setDraggingKey(null)
      if (willMove) {
        optionsRef.current.onDrop(key, overIndex)
      }
    },
    [elements, stopAutoScroll],
  )

  useEffect(() => {
    if (draggingKey === null) {
      return
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        finish(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [draggingKey, finish])

  useEffect(() => () => stopAutoScroll(), [stopAutoScroll])

  const handleProps = useCallback(
    (key: K): HandleProps => ({
      onPointerDown(event) {
        const { disabled, keys } = optionsRef.current
        if (disabled || event.button !== 0 || session.current) {
          return
        }
        const fromIndex = keys.indexOf(key)
        const rects = elements().map((element) => element?.getBoundingClientRect())
        if (fromIndex < 0 || rects.some((rect) => !rect)) {
          return
        }
        const slots = rects.map((rect) => ({
          top: (rect as DOMRect).top + window.scrollY,
          height: (rect as DOMRect).height,
        }))
        const first = slots[0]
        const second = slots[1]
        const gap = first && second ? second.top - (first.top + first.height) : 0
        event.currentTarget.setPointerCapture(event.pointerId)
        session.current = {
          key,
          fromIndex,
          overIndex: fromIndex,
          pointerId: event.pointerId,
          startPageY: event.clientY + window.scrollY,
          clientY: event.clientY,
          slots,
          step: (slots[fromIndex]?.height ?? 0) + Math.max(gap, 0),
          started: false,
        }
      },
      onPointerMove(event) {
        const current = session.current
        if (!current || current.pointerId !== event.pointerId) {
          return
        }
        current.clientY = event.clientY
        if (!current.started) {
          if (Math.abs(event.clientY + window.scrollY - current.startPageY) < DRAG_THRESHOLD) {
            return
          }
          current.started = true
          document.body.style.userSelect = 'none'
          setDraggingKey(current.key)
          scrollFrame.current = requestAnimationFrame(autoScroll)
        }
        event.preventDefault()
        layout()
      },
      onPointerUp(event) {
        if (session.current?.pointerId === event.pointerId) {
          finish(true)
        }
      },
      onPointerCancel(event) {
        if (session.current?.pointerId === event.pointerId) {
          finish(false)
        }
      },
    }),
    [autoScroll, elements, finish, layout],
  )

  return { draggingKey, handleProps }
}
