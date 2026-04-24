export const COMPOSER_TEXTAREA_MIN_HEIGHT_PX = 44
export const COMPOSER_TEXTAREA_MAX_HEIGHT_PX = 128

export function createClientMessageKey() {
  if (globalThis.crypto?.randomUUID) {
    return `portal-send:${globalThis.crypto.randomUUID()}`
  }

  return `portal-send:${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`
}

export function createAttachmentSignature(file: File) {
  return [file.name, file.type, file.size, file.lastModified].join(':')
}

export function formatSelectedAttachmentSize(fileSize: number) {
  if (fileSize >= 1024 * 1024) {
    return `${(fileSize / 1024 / 1024).toFixed(1)} МБ`
  }

  return `${Math.max(1, Math.round(fileSize / 1024))} КБ`
}

export function formatRecordingDuration(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0',
  )}`
}

export function resizeComposerTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = 'auto'

  if (textarea.value.length === 0) {
    textarea.style.height = `${COMPOSER_TEXTAREA_MIN_HEIGHT_PX}px`
    textarea.style.overflowY = 'hidden'
    return
  }

  const nextHeight = Math.max(
    COMPOSER_TEXTAREA_MIN_HEIGHT_PX,
    Math.min(textarea.scrollHeight, COMPOSER_TEXTAREA_MAX_HEIGHT_PX),
  )

  textarea.style.height = `${nextHeight}px`
  textarea.style.overflowY =
    textarea.scrollHeight > COMPOSER_TEXTAREA_MAX_HEIGHT_PX ? 'auto' : 'hidden'
}
