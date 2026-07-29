type ComposerInteractionStateInput = {
  attachmentCount: number
  disabled: boolean
  isAttachmentSendDisabled: boolean
  isSending: boolean
  isTextDraftTooLong: boolean
  isTextSendPending: boolean
  isVoiceRecorderBusy: boolean
  isVoiceSendDisabled: boolean
  normalizedDraftLength: number
  shouldPrioritizeTextDraft: boolean
}

export function getComposerInteractionState({
  attachmentCount,
  disabled,
  isAttachmentSendDisabled,
  isSending,
  isTextDraftTooLong,
  isTextSendPending,
  isVoiceRecorderBusy,
  isVoiceSendDisabled,
  normalizedDraftLength,
  shouldPrioritizeTextDraft,
}: ComposerInteractionStateInput) {
  const canSendText =
    normalizedDraftLength > 0 &&
    !isTextDraftTooLong &&
    !disabled &&
    !isSending &&
    !isTextSendPending &&
    !isVoiceRecorderBusy
  const canSendAttachment =
    attachmentCount > 0 &&
    !isTextDraftTooLong &&
    !isAttachmentSendDisabled &&
    !disabled &&
    !isSending &&
    !isVoiceRecorderBusy

  return {
    canSend: canSendAttachment || canSendText,
    canSendAttachment,
    canSendText,
    canStartVoiceRecording:
      !isVoiceSendDisabled &&
      !disabled &&
      !isSending &&
      !isVoiceRecorderBusy &&
      attachmentCount === 0 &&
      !shouldPrioritizeTextDraft,
    isAttachmentControlDisabled:
      isAttachmentSendDisabled ||
      disabled ||
      isSending ||
      isVoiceRecorderBusy ||
      shouldPrioritizeTextDraft,
  }
}
