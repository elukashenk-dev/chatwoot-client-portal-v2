import { useLayoutEffect } from 'react'

import type { ChatMessage } from '../types'
import {
  captureTranscriptScrollSnapshot,
  type TranscriptScrollSnapshot,
} from './ChatTranscriptScroll'
import { cancelNextFrame, requestNextFrame } from './chat-transcript/utils'

type MutableRef<T> = {
  current: T
}

type UseTranscriptMessageScrollOptions = {
  messages: ChatMessage[]
  previousScrollSnapshotRef: MutableRef<TranscriptScrollSnapshot | null>
  scrollElementRef: MutableRef<HTMLElement | null>
  scrollToMessageId: number | null
  scrollToMessageSignal: number
  shouldAutoFollowNewMessagesRef: MutableRef<boolean>
  lastScrollToMessageSignalRef: MutableRef<number>
}

export function useTranscriptMessageScroll({
  lastScrollToMessageSignalRef,
  messages,
  previousScrollSnapshotRef,
  scrollElementRef,
  scrollToMessageId,
  scrollToMessageSignal,
  shouldAutoFollowNewMessagesRef,
}: UseTranscriptMessageScrollOptions) {
  useLayoutEffect(() => {
    if (lastScrollToMessageSignalRef.current === scrollToMessageSignal) {
      return
    }

    lastScrollToMessageSignalRef.current = scrollToMessageSignal

    if (scrollToMessageId === null) {
      return
    }

    const scrollElement = scrollElementRef.current

    if (!scrollElement) {
      return
    }

    const activeScrollElement: HTMLElement = scrollElement
    let secondFrameId: number | null = null

    function scrollToMessageAndCapture() {
      const targetElement = activeScrollElement.querySelector<HTMLElement>(
        `[data-message-id="${scrollToMessageId}"]`,
      )

      if (!targetElement) {
        return
      }

      targetElement.scrollIntoView({
        behavior: 'auto',
        block: 'center',
      })
      previousScrollSnapshotRef.current = captureTranscriptScrollSnapshot(
        activeScrollElement,
        messages,
      )
      shouldAutoFollowNewMessagesRef.current = false
    }

    scrollToMessageAndCapture()
    const firstFrameId = requestNextFrame(() => {
      scrollToMessageAndCapture()
      secondFrameId = requestNextFrame(scrollToMessageAndCapture)
    })

    return () => {
      cancelNextFrame(firstFrameId)
      cancelNextFrame(secondFrameId)
    }
  }, [
    lastScrollToMessageSignalRef,
    messages,
    previousScrollSnapshotRef,
    scrollElementRef,
    scrollToMessageId,
    scrollToMessageSignal,
    shouldAutoFollowNewMessagesRef,
  ])
}
