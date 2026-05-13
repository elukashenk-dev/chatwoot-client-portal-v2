import { useCallback, useRef } from 'react'

import { resizeComposerTextarea } from './utils'

export function useComposerTextarea() {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current

    if (!textarea) {
      return
    }

    resizeComposerTextarea(textarea)
  }, [])

  const focusTextarea = useCallback(() => {
    textareaRef.current?.focus()
  }, [])

  return {
    focusTextarea,
    resizeTextarea,
    textareaRef,
  }
}
