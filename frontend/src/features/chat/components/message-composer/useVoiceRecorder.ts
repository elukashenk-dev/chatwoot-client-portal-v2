import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'

import type { VoiceRecorderStatus } from './types'

const VOICE_RECORDING_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
]

type UseVoiceRecorderOptions = {
  canStartRecording: boolean
  onSendVoiceAttachment: (file: File) => Promise<boolean>
}

type VoiceRecorderController = {
  cancelVoiceRecording: () => void
  clearErrorMessage: () => void
  errorMessage: string | null
  finishVoiceRecording: () => void
  recordingElapsedMs: number
  startVoiceRecording: () => Promise<void>
  status: VoiceRecorderStatus
}

function createVoiceAttachmentFileName(mimeType: string) {
  const now = new Date()
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')
  const normalizedMimeType = mimeType.toLowerCase()
  const extension = normalizedMimeType.includes('ogg')
    ? 'ogg'
    : normalizedMimeType.includes('mp4')
      ? 'm4a'
      : normalizedMimeType.includes('wav')
        ? 'wav'
        : 'webm'

  return `voice-message-${timestamp}.${extension}`
}

function getCurrentTimestampMs() {
  return Date.now()
}

function getSupportedVoiceMimeType() {
  if (typeof MediaRecorder === 'undefined') {
    return ''
  }

  if (typeof MediaRecorder.isTypeSupported !== 'function') {
    return ''
  }

  return (
    VOICE_RECORDING_MIME_TYPES.find((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType),
    ) ?? ''
  )
}

function getVoiceRecordingStartErrorMessage(error: unknown) {
  const errorName =
    typeof error === 'object' && error && 'name' in error
      ? String(error.name)
      : ''

  if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
    return 'Разрешите доступ к микрофону и попробуйте еще раз.'
  }

  if (errorName === 'NotFoundError') {
    return 'Микрофон не найден.'
  }

  return 'Не удалось начать запись. Попробуйте еще раз.'
}

function stopVoiceStream(streamRef: MutableRefObject<MediaStream | null>) {
  streamRef.current?.getTracks().forEach((track) => {
    track.stop()
  })
  streamRef.current = null
}

export function useVoiceRecorder({
  canStartRecording,
  onSendVoiceAttachment,
}: UseVoiceRecorderOptions): VoiceRecorderController {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0)
  const [status, setStatus] = useState<VoiceRecorderStatus>('idle')
  const isMountedRef = useRef(false)
  const onSendVoiceAttachmentRef = useRef(onSendVoiceAttachment)
  const voiceChunksRef = useRef<Blob[]>([])
  const voiceMediaRecorderRef = useRef<MediaRecorder | null>(null)
  const voiceRecordingStartedAtRef = useRef<number | null>(null)
  const voiceStreamRef = useRef<MediaStream | null>(null)
  const shouldSendVoiceRecordingRef = useRef(false)

  useLayoutEffect(() => {
    onSendVoiceAttachmentRef.current = onSendVoiceAttachment
  }, [onSendVoiceAttachment])

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
      shouldSendVoiceRecordingRef.current = false
      stopVoiceStream(voiceStreamRef)

      const recorder = voiceMediaRecorderRef.current

      if (recorder && recorder.state !== 'inactive') {
        recorder.stop()
      }
    }
  }, [])

  useEffect(() => {
    if (status !== 'recording') {
      return undefined
    }

    const timerId = window.setInterval(() => {
      if (!voiceRecordingStartedAtRef.current) {
        return
      }

      setRecordingElapsedMs(Date.now() - voiceRecordingStartedAtRef.current)
    }, 500)

    return () => {
      window.clearInterval(timerId)
    }
  }, [status])

  function clearErrorMessage() {
    if (errorMessage) {
      setErrorMessage(null)
    }
  }

  async function sendRecordedVoiceAttachment(
    chunks: Blob[],
    recordedMimeType: string,
  ) {
    if (chunks.length === 0) {
      setStatus('idle')
      setErrorMessage('Голосовое сообщение получилось пустым.')
      return
    }

    const mimeType = recordedMimeType || chunks[0]?.type || 'audio/webm'
    const voiceBlob = new Blob(chunks, { type: mimeType })
    const voiceFile = new File(
      [voiceBlob],
      createVoiceAttachmentFileName(mimeType),
      {
        lastModified: getCurrentTimestampMs(),
        type: mimeType,
      },
    )

    setStatus('sending')

    const wasSent = await onSendVoiceAttachmentRef.current(voiceFile)

    if (!isMountedRef.current) {
      return
    }

    if (wasSent) {
      setErrorMessage(null)
    }

    setStatus('idle')
  }

  async function startVoiceRecording() {
    if (!canStartRecording) {
      return
    }

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setErrorMessage('Голосовая запись недоступна в этом браузере.')
      return
    }

    setErrorMessage(null)
    setRecordingElapsedMs(0)
    setStatus('starting')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      if (!isMountedRef.current) {
        stream.getTracks().forEach((track) => {
          track.stop()
        })
        return
      }

      const mimeType = getSupportedVoiceMimeType()
      voiceStreamRef.current = stream
      const mediaRecorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      )

      voiceChunksRef.current = []
      voiceMediaRecorderRef.current = mediaRecorder
      shouldSendVoiceRecordingRef.current = false

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          voiceChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onerror = () => {
        shouldSendVoiceRecordingRef.current = false
        stopVoiceStream(voiceStreamRef)
        voiceMediaRecorderRef.current = null
        voiceChunksRef.current = []

        if (isMountedRef.current) {
          setStatus('idle')
          setErrorMessage('Не удалось записать голосовое сообщение.')
        }
      }

      mediaRecorder.onstop = () => {
        const chunks = voiceChunksRef.current
        const shouldSend = shouldSendVoiceRecordingRef.current
        const recordedMimeType = mediaRecorder.mimeType || mimeType

        stopVoiceStream(voiceStreamRef)
        voiceMediaRecorderRef.current = null
        voiceChunksRef.current = []
        shouldSendVoiceRecordingRef.current = false

        if (!isMountedRef.current) {
          return
        }

        if (!shouldSend) {
          setStatus('idle')
          return
        }

        void sendRecordedVoiceAttachment(chunks, recordedMimeType)
      }

      mediaRecorder.start()
      voiceRecordingStartedAtRef.current = getCurrentTimestampMs()
      setRecordingElapsedMs(0)
      setStatus('recording')
    } catch (error) {
      stopVoiceStream(voiceStreamRef)
      voiceMediaRecorderRef.current = null
      voiceChunksRef.current = []
      shouldSendVoiceRecordingRef.current = false

      if (isMountedRef.current) {
        setStatus('idle')
        setErrorMessage(getVoiceRecordingStartErrorMessage(error))
      }
    }
  }

  function finishVoiceRecording() {
    const mediaRecorder = voiceMediaRecorderRef.current

    if (
      status !== 'recording' ||
      !mediaRecorder ||
      mediaRecorder.state === 'inactive'
    ) {
      return
    }

    shouldSendVoiceRecordingRef.current = true
    setStatus('stopping')
    mediaRecorder.stop()
  }

  function cancelVoiceRecording() {
    const mediaRecorder = voiceMediaRecorderRef.current

    shouldSendVoiceRecordingRef.current = false

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      setStatus('stopping')
      mediaRecorder.stop()
      return
    }

    stopVoiceStream(voiceStreamRef)
    voiceMediaRecorderRef.current = null
    voiceChunksRef.current = []
    setStatus('idle')
  }

  return {
    cancelVoiceRecording,
    clearErrorMessage,
    errorMessage,
    finishVoiceRecording,
    recordingElapsedMs,
    startVoiceRecording,
    status,
  }
}
