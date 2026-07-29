export const CHAT_ATTACHMENT_MAX_ACTIVE_UPLOADS = 2

type CreateChatAttachmentUploadAdmissionOptions = {
  maxActiveUploads?: number
}

export function createChatAttachmentUploadAdmission({
  maxActiveUploads = CHAT_ATTACHMENT_MAX_ACTIVE_UPLOADS,
}: CreateChatAttachmentUploadAdmissionOptions = {}) {
  let activeUploads = 0

  return {
    tryAcquire() {
      if (activeUploads >= maxActiveUploads) {
        return null
      }

      activeUploads += 1
      let released = false

      return () => {
        if (released) {
          return
        }

        released = true
        activeUploads -= 1
      }
    },
  }
}

export type ChatAttachmentUploadAdmission = ReturnType<
  typeof createChatAttachmentUploadAdmission
>
