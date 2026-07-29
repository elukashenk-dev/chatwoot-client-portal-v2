import { describe, expect, it } from 'vitest'

import { getComposerInteractionState } from './interactionState'

const baseInput = {
  attachmentCount: 0,
  disabled: false,
  isAttachmentSendDisabled: false,
  isSending: false,
  isTextDraftTooLong: false,
  isTextSendPending: false,
  isVoiceRecorderBusy: false,
  isVoiceSendDisabled: false,
  normalizedDraftLength: 0,
  shouldPrioritizeTextDraft: false,
}

describe('getComposerInteractionState', () => {
  it('allows attachment sending only for a non-empty idle batch', () => {
    expect(
      getComposerInteractionState({ ...baseInput, attachmentCount: 0 })
        .canSendAttachment,
    ).toBe(false)
    expect(
      getComposerInteractionState({ ...baseInput, attachmentCount: 1 })
        .canSendAttachment,
    ).toBe(true)
    expect(
      getComposerInteractionState({
        ...baseInput,
        attachmentCount: 1,
        isSending: true,
      }).canSendAttachment,
    ).toBe(false)
  })
})
