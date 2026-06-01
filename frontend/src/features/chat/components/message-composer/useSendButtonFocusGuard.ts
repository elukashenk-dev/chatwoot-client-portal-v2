import {
  useLayoutEffect,
  useRef,
  type PointerEvent,
  type RefObject,
} from 'react'

type UseSendButtonFocusGuardInput = {
  onGuardedTouchSend: () => void
  sendButtonRef: RefObject<HTMLButtonElement | null>
  textareaRef: RefObject<HTMLTextAreaElement | null>
}

export function useSendButtonFocusGuard({
  onGuardedTouchSend,
  sendButtonRef,
  textareaRef,
}: UseSendButtonFocusGuardInput) {
  const onGuardedTouchSendRef = useRef(onGuardedTouchSend)
  const touchHandledSendAtRef = useRef(0)
  const touchStartedWithTextareaFocusRef = useRef(false)

  useLayoutEffect(() => {
    onGuardedTouchSendRef.current = onGuardedTouchSend
  }, [onGuardedTouchSend])

  function isTextareaFocused() {
    const textarea = textareaRef.current

    return Boolean(textarea && document.activeElement === textarea)
  }

  function preserveTextareaFocusOnPointerDown(
    event: PointerEvent<HTMLButtonElement>,
  ) {
    if (!isTextareaFocused()) {
      return
    }

    event.preventDefault()
  }

  function shouldSkipClickAfterTouchSend() {
    return Date.now() - touchHandledSendAtRef.current < 750
  }

  useLayoutEffect(() => {
    const sendButton = sendButtonRef.current

    if (!sendButton) {
      return
    }

    function handleTouchStart(event: Event) {
      const shouldPreserveFocus = isTextareaFocused()

      touchStartedWithTextareaFocusRef.current = shouldPreserveFocus

      if (shouldPreserveFocus) {
        event.preventDefault()
      }
    }

    function handleTouchEnd(event: Event) {
      if (!touchStartedWithTextareaFocusRef.current) {
        return
      }

      touchStartedWithTextareaFocusRef.current = false
      touchHandledSendAtRef.current = Date.now()
      event.preventDefault()
      onGuardedTouchSendRef.current()
    }

    sendButton.addEventListener('touchstart', handleTouchStart, {
      passive: false,
    })
    sendButton.addEventListener('touchend', handleTouchEnd, {
      passive: false,
    })

    return () => {
      sendButton.removeEventListener('touchstart', handleTouchStart)
      sendButton.removeEventListener('touchend', handleTouchEnd)
    }
  })

  return {
    preserveTextareaFocusOnPointerDown,
    shouldSkipClickAfterTouchSend,
  }
}
