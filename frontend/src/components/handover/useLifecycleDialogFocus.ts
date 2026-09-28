import { useEffect, useRef } from "react"

/** Keyboard ownership for account/lifecycle dialogs; shared modal callers stay unchanged. */
export function useLifecycleDialogFocus(dialogKey: string | null, onClose: () => void) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const lastOutsideFocus = useRef<HTMLElement | null>(null)

  // Prompt fields may autofocus during the commit, before the dialog effect.
  // Remember the trigger while focus is still in the account content.
  useEffect(() => {
    const remember = (event: FocusEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && !target.closest('[role="dialog"]')) {
        lastOutsideFocus.current = target
      }
    }
    document.addEventListener("focusin", remember)
    return () => document.removeEventListener("focusin", remember)
  }, [])

  useEffect(() => {
    if (!dialogKey) return
    const dialog = document.querySelector<HTMLElement>(
      ".public-account [role=dialog], .public-lifecycle [role=dialog]",
    )
    if (!dialog) return
    const previous = lastOutsideFocus.current || (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    const controls = () => [...dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
    )].filter(element => element.getClientRects().length > 0)
    const focusFirst = () => controls()[0]?.focus({ preventScroll: true })
    if (!dialog.contains(document.activeElement)) focusFirst()
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        closeRef.current()
      } else if (event.key === "Tab") {
        const items = controls()
        const first = items[0]
        const last = items[items.length - 1]
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    const focusin = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) focusFirst()
    }
    document.addEventListener("keydown", keydown)
    document.addEventListener("focusin", focusin)
    return () => {
      document.removeEventListener("keydown", keydown)
      document.removeEventListener("focusin", focusin)
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [dialogKey])
}
