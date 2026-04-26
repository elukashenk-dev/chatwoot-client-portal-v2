export const COMPOSER_TEXTAREA_MIN_HEIGHT_PX = 44
export const COMPOSER_TEXTAREA_MAX_HEIGHT_PX = 128
const MP3_BITRATE_KBPS = 64
const MP3_ENCODER_SAMPLE_BLOCK_SIZE = 1152
const VOICE_MP3_MIME_TYPE = 'audio/mp3'
const WEBKIT_WEBM_HEADER_SCAN_BYTES = 512
const WEBM_EBML_HEADER = [0x1a, 0x45, 0xdf, 0xa3]
const MP4_FILE_TYPE_BOX = 'ftyp'
const WEBKIT_WEBM_MARKER = 'WebKit'
const VOICE_RECORDING_IOS_MIME_TYPES = ['audio/mp4', 'audio/aac', 'audio/x-m4a']

type AudioContextConstructor = new () => AudioContext

type WindowWithWebkitAudioContext = Window &
  typeof globalThis & {
    webkitAudioContext?: AudioContextConstructor
  }
type Mp3EncoderConstructor = typeof import('@breezystack/lamejs').Mp3Encoder

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

function createVoiceAttachmentFileName(mimeType: string, nowMs: number) {
  const now = new Date(nowMs)
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
    : normalizedMimeType.includes('mp3') || normalizedMimeType.includes('mpeg')
      ? 'mp3'
      : normalizedMimeType.includes('mp4') || normalizedMimeType.includes('m4a')
        ? 'm4a'
        : 'webm'

  return `voice-message-${timestamp}.${extension}`
}

function shouldNormalizeRecordedVoiceMimeType(mimeType: string) {
  const normalizedMimeType = mimeType.toLowerCase()

  return VOICE_RECORDING_IOS_MIME_TYPES.some((iosMimeType) =>
    normalizedMimeType.includes(iosMimeType),
  )
}

function floatSampleToInt16(sample: number) {
  const clampedSample = Math.max(-1, Math.min(1, sample))

  return clampedSample < 0 ? clampedSample * 0x8000 : clampedSample * 0x7fff
}

function mixAudioBufferToMonoPcm(audioBuffer: AudioBuffer) {
  const numberOfChannels = Math.max(1, audioBuffer.numberOfChannels)
  const mixedSamples = new Int16Array(audioBuffer.length)
  const channelData = Array.from({ length: numberOfChannels }, (_, index) =>
    audioBuffer.getChannelData(index),
  )

  for (
    let sampleIndex = 0;
    sampleIndex < audioBuffer.length;
    sampleIndex += 1
  ) {
    let mixedSample = 0

    for (
      let channelIndex = 0;
      channelIndex < numberOfChannels;
      channelIndex += 1
    ) {
      mixedSample += channelData[channelIndex][sampleIndex] ?? 0
    }

    mixedSamples[sampleIndex] = floatSampleToInt16(
      mixedSample / numberOfChannels,
    )
  }

  return mixedSamples
}

function copyBytesToArrayBuffer(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength)

  new Uint8Array(buffer).set(bytes)

  return buffer
}

async function getMp3EncoderConstructor(): Promise<Mp3EncoderConstructor> {
  const { Mp3Encoder } = await import('@breezystack/lamejs')

  return Mp3Encoder
}

async function encodeAudioBufferToMp3(audioBuffer: AudioBuffer) {
  if (audioBuffer.length === 0) {
    throw new Error('Audio buffer is empty.')
  }

  const Mp3Encoder = await getMp3EncoderConstructor()
  const mp3Encoder = new Mp3Encoder(1, audioBuffer.sampleRate, MP3_BITRATE_KBPS)
  const pcmSamples = mixAudioBufferToMonoPcm(audioBuffer)
  const encodedChunks: ArrayBuffer[] = []

  for (
    let offset = 0;
    offset < pcmSamples.length;
    offset += MP3_ENCODER_SAMPLE_BLOCK_SIZE
  ) {
    const encodedChunk = mp3Encoder.encodeBuffer(
      pcmSamples.subarray(offset, offset + MP3_ENCODER_SAMPLE_BLOCK_SIZE),
    )

    if (encodedChunk.length > 0) {
      encodedChunks.push(copyBytesToArrayBuffer(encodedChunk))
    }
  }

  const finalChunk = mp3Encoder.flush()

  if (finalChunk.length > 0) {
    encodedChunks.push(copyBytesToArrayBuffer(finalChunk))
  }

  return new Blob(encodedChunks, { type: VOICE_MP3_MIME_TYPE })
}

function getAudioContextConstructor() {
  return (
    window.AudioContext ??
    (window as WindowWithWebkitAudioContext).webkitAudioContext
  )
}

async function convertAudioBlobToMp3(audioBlob: Blob) {
  const AudioContextCtor = getAudioContextConstructor()

  if (!AudioContextCtor) {
    throw new Error('AudioContext is unavailable.')
  }

  const audioContext = new AudioContextCtor()

  try {
    const audioBuffer = await audioContext.decodeAudioData(
      await audioBlob.arrayBuffer(),
    )

    return await encodeAudioBufferToMp3(audioBuffer)
  } finally {
    await audioContext.close()
  }
}

function bytesStartWith(bytes: Uint8Array, expectedBytes: number[]) {
  return expectedBytes.every(
    (expectedByte, index) => bytes[index] === expectedByte,
  )
}

function bytesContainAsciiString(bytes: Uint8Array, value: string) {
  const valueBytes = Array.from(value, (char) => char.charCodeAt(0))

  return bytes.some((_, offset) =>
    valueBytes.every((valueByte, index) => bytes[offset + index] === valueByte),
  )
}

function bytesContainMp4FileTypeBox(bytes: Uint8Array) {
  return bytesContainAsciiString(bytes.slice(4, 12), MP4_FILE_TYPE_BOX)
}

async function shouldNormalizeRecordedVoiceBlob(audioBlob: Blob) {
  const headerBytes = new Uint8Array(
    await audioBlob.slice(0, WEBKIT_WEBM_HEADER_SCAN_BYTES).arrayBuffer(),
  )

  return (
    bytesContainMp4FileTypeBox(headerBytes) ||
    (bytesStartWith(headerBytes, WEBM_EBML_HEADER) &&
      bytesContainAsciiString(headerBytes, WEBKIT_WEBM_MARKER))
  )
}

export async function createVoiceAttachmentFile({
  chunks,
  now = () => Date.now(),
  recordedMimeType,
}: {
  chunks: Blob[]
  now?: () => number
  recordedMimeType: string
}) {
  const sourceMimeType = recordedMimeType || chunks[0]?.type || 'audio/webm'
  const createdAtMs = now()
  const sourceBlob = new Blob(chunks, { type: sourceMimeType })

  const shouldNormalize =
    shouldNormalizeRecordedVoiceMimeType(sourceMimeType) ||
    (await shouldNormalizeRecordedVoiceBlob(sourceBlob))

  if (!shouldNormalize) {
    return new File(
      [sourceBlob],
      createVoiceAttachmentFileName(sourceMimeType, createdAtMs),
      {
        lastModified: createdAtMs,
        type: sourceMimeType,
      },
    )
  }

  const normalizedBlob = await convertAudioBlobToMp3(sourceBlob)

  return new File(
    [normalizedBlob],
    createVoiceAttachmentFileName(normalizedBlob.type, createdAtMs),
    {
      lastModified: createdAtMs,
      type: normalizedBlob.type,
    },
  )
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
