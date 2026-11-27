// Hold to confirm: a destructive action commits only while the control is pressed.
//
// The fill is driven frame by frame from the real press duration, so it always
// shows the time actually left — it is progress, not decoration, which is why
// nothing here runs on a CSS timer. Releasing early, pressing Escape or leaving
// the window cancels and the fill retracts on a motion token.
//
// The fill is a child of the button and inherits its `border-radius`, so it takes
// the shape each theme gives the control (circle, chip, rounded square) instead of
// forcing one ring geometry on all four.
//
// Keyboard mirrors the pointer: Space/Enter down starts, up cancels, so a
// keyboard user holds the same 0.8 s as a mouse user instead of confirming with
// one keystroke.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import './hold-to-confirm.css'

/** How long the full fill stays before the button returns to rest. */
const DONE_FADE_MS = 220

interface HoldToConfirmProps {
  /** Fires once the press has lasted `holdMs`. */
  onConfirm: () => void
  /** Read out by screen readers; say what the hold does, not "confirm". */
  label: string
  /** Pointer tooltip; defaults to the label. */
  title?: string
  /** Press length. Long enough to be deliberate, short enough to stay one gesture. */
  holdMs?: number
  disabled?: boolean
  className?: string
  children: ReactNode
}

export function HoldToConfirm({
  onConfirm,
  label,
  title,
  holdMs = 800,
  disabled = false,
  className = '',
  children,
}: HoldToConfirmProps) {
  const [holding, setHolding] = useState(false)
  const [done, setDone] = useState(false)
  const fillRef = useRef<HTMLSpanElement | null>(null)
  const frameRef = useRef(0)
  const doneTimerRef = useRef(0)
  const startedAtRef = useRef(0)
  const pressingRef = useRef(false)

  const paint = useCallback((ratio: number) => {
    const fill = fillRef.current
    if (fill) fill.style.transform = `scaleY(${ratio})`
  }, [])

  const cancel = useCallback(() => {
    pressingRef.current = false
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
    setHolding(false)
    paint(0)
  }, [paint])

  const start = useCallback(() => {
    if (disabled || pressingRef.current) return
    pressingRef.current = true
    setHolding(true)
    paint(0)
    startedAtRef.current = performance.now()
    const tick = () => {
      const ratio = Math.min(1, (performance.now() - startedAtRef.current) / holdMs)
      paint(ratio)
      if (ratio < 1) {
        frameRef.current = requestAnimationFrame(tick)
        return
      }
      frameRef.current = 0
      pressingRef.current = false
      setHolding(false)
      setDone(true)
      paint(1)
      onConfirm()
      doneTimerRef.current = window.setTimeout(() => {
        setDone(false)
        paint(0)
      }, DONE_FADE_MS)
    }
    frameRef.current = requestAnimationFrame(tick)
  }, [disabled, holdMs, onConfirm, paint])

  // The pointer may drift off a 30px control while it is held, so the release is
  // watched on the window instead of the button; pointercancel and blur cancel.
  useEffect(() => {
    if (!holding) return
    const end = () => cancel()
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    window.addEventListener('blur', end)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('blur', end)
    }
  }, [holding, cancel])

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    if (doneTimerRef.current) window.clearTimeout(doneTimerRef.current)
  }, [])

  return (
    <button
      type="button"
      className={`hold-confirm${className ? ` ${className}` : ''}`}
      data-holding={holding ? '' : undefined}
      data-done={done ? '' : undefined}
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.stopPropagation()
        start()
      }}
      onPointerUp={(event) => {
        event.stopPropagation()
        cancel()
      }}
      onPointerCancel={cancel}
      onKeyDown={(event) => {
        if (event.key !== ' ' && event.key !== 'Enter' && event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        if (event.key === 'Escape') {
          cancel()
          return
        }
        if (!event.repeat) start()
      }}
      onKeyUp={(event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return
        event.preventDefault()
        event.stopPropagation()
        cancel()
      }}
      onBlur={cancel}
      // The card underneath opens on click; a press on this control never does.
      onClick={(event) => event.stopPropagation()}
    >
      <span ref={fillRef} className="hold-confirm__fill" aria-hidden="true" />
      <span className="hold-confirm__icon">{children}</span>
    </button>
  )
}
