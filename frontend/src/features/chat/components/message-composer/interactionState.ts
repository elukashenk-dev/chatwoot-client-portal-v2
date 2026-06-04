type ComposerInteractionStateInput = {
  disabled: boolean
  isAttachmentSendDisabled: boolean
  isSending: boolean
  isTextDraftTooLong: boolean
  isTextSendPending: boolean
  isVoiceRecorderBusy: boolean
  isVoiceSendDisabled: boolean
  normalizedDraftLength: number
  selectedAttachment: File | null
  shouldPrioritizeTextDraft: boolean
}

export function getComposerInteractionState({
  disabled,
  isAttachmentSendDisabled,
  isSending,
  isTextDraftTooLong,
  isTextSendPending,
  isVoiceRecorderBusy,
  isVoiceSendDisabled,
  normalizedDraftLength,
  selectedAttachment,
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
    selectedAttachment !== null &&
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
      selectedAttachment === null &&
      !shouldPrioritizeTextDraft,
    isAttachmentControlDisabled:
      isAttachmentSendDisabled ||
      disabled ||
      isSending ||
      isVoiceRecorderBusy ||
      shouldPrioritizeTextDraft,
  }
}
