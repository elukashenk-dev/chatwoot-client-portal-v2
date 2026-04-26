import { afterEach, describe, expect, it, vi } from 'vitest'

const mp3EncoderInstances = vi.hoisted(
  () =>
    [] as Array<{
      encodeBuffer: ReturnType<typeof vi.fn>
      flush: ReturnType<typeof vi.fn>
    }>,
)
const mp3EncoderMock = vi.hoisted(() =>
  vi.fn().mockImplementation(function Mp3EncoderMock() {
    const instance = {
      encodeBuffer: vi.fn().mockReturnValue(new Uint8Array([0x11, 0x22])),
      flush: vi.fn().mockReturnValue(new Uint8Array([0x33])),
    }

    mp3EncoderInstances.push(instance)

    return instance
  }),
)

vi.mock('@breezystack/lamejs', () => ({
  Mp3Encoder: mp3EncoderMock,
}))

import {
  COMPOSER_TEXTAREA_MAX_HEIGHT_PX,
  COMPOSER_TEXTAREA_MIN_HEIGHT_PX,
  createVoiceAttachmentFile,
  resizeComposerTextarea,
} from './utils'

function createTextarea({
  scrollHeight,
  value,
}: {
  scrollHeight: number
  value: string
}) {
  const textarea = document.createElement('textarea')

  textarea.value = value

  Object.defineProperty(textarea, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  })

  return textarea
}

function createAudioBufferStub() {
  const channelData = [new Float32Array([0, 0.5, -0.5, 1])]

  return {
    getChannelData: vi.fn((channelIndex: number) => channelData[channelIndex]),
    length: channelData[0].length,
    numberOfChannels: channelData.length,
    sampleRate: 48000,
  } as unknown as AudioBuffer
}

function createWebKitWebmBlob() {
  const header = new Uint8Array([
    0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81,
    0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84,
    0x77, 0x65, 0x62, 0x6d, 0x4d, 0x80, 0x86, 0x57, 0x65, 0x62, 0x4b, 0x69,
    0x74,
  ])

  return new Blob([header, 'voice-bytes'], {
    type: 'audio/webm;codecs=opus',
  })
}

describe('resizeComposerTextarea', () => {
  it('keeps an empty composer at the single-line minimum height', () => {
    const textarea = createTextarea({
      scrollHeight: 72,
      value: '',
    })

    resizeComposerTextarea(textarea)

    expect(textarea.style.height).toBe(`${COMPOSER_TEXTAREA_MIN_HEIGHT_PX}px`)
    expect(textarea.style.overflowY).toBe('hidden')
  })

  it('grows non-empty composer content up to the max height', () => {
    const textarea = createTextarea({
      scrollHeight: 180,
      value: 'Очень длинное сообщение',
    })

    resizeComposerTextarea(textarea)

    expect(textarea.style.height).toBe(`${COMPOSER_TEXTAREA_MAX_HEIGHT_PX}px`)
    expect(textarea.style.overflowY).toBe('auto')
  })
})

describe('createVoiceAttachmentFile', () => {
  afterEach(() => {
    mp3EncoderMock.mockClear()
    mp3EncoderInstances.length = 0
    vi.unstubAllGlobals()
  })

  it('keeps browser WebM voice recordings unchanged', async () => {
    const file = await createVoiceAttachmentFile({
      chunks: [new Blob(['voice-bytes'], { type: 'audio/webm;codecs=opus' })],
      now: () => 1_777_000_000_000,
      recordedMimeType: 'audio/webm;codecs=opus',
    })

    expect(file.name).toMatch(/^voice-message-\d{8}-\d{6}\.webm$/)
    expect(file.type).toBe('audio/webm;codecs=opus')
    await expect(file.text()).resolves.toBe('voice-bytes')
  })

  it('normalizes iOS MP4 voice recordings to MP3 with stable metadata', async () => {
    const audioBuffer = createAudioBufferStub()
    const close = vi.fn().mockResolvedValue(undefined)
    const decodeAudioData = vi.fn().mockResolvedValue(audioBuffer)

    class AudioContextStub {
      close = close
      decodeAudioData = decodeAudioData
    }

    vi.stubGlobal('AudioContext', AudioContextStub)

    const file = await createVoiceAttachmentFile({
      chunks: [new Blob(['ios-audio-bytes'], { type: 'audio/mp4' })],
      now: () => 1_777_000_000_000,
      recordedMimeType: 'audio/mp4;codecs=mp4a.40.2',
    })

    expect(file.name).toMatch(/^voice-message-\d{8}-\d{6}\.mp3$/)
    expect(file.type).toBe('audio/mp3')
    expect(decodeAudioData).toHaveBeenCalledWith(expect.any(ArrayBuffer))
    expect(close).toHaveBeenCalled()
    expect(mp3EncoderMock).toHaveBeenCalledWith(1, 48000, 64)
    expect(mp3EncoderInstances[0]?.encodeBuffer).toHaveBeenCalledWith(
      expect.any(Int16Array),
    )
    expect(mp3EncoderInstances[0]?.flush).toHaveBeenCalled()
    await expect(file.arrayBuffer()).resolves.toEqual(
      new Uint8Array([0x11, 0x22, 0x33]).buffer,
    )
  })

  it('normalizes WebKit WebM voice recordings to MP3 when duration metadata is unreliable', async () => {
    const audioBuffer = createAudioBufferStub()
    const close = vi.fn().mockResolvedValue(undefined)
    const decodeAudioData = vi.fn().mockResolvedValue(audioBuffer)

    class AudioContextStub {
      close = close
      decodeAudioData = decodeAudioData
    }

    vi.stubGlobal('AudioContext', AudioContextStub)

    const file = await createVoiceAttachmentFile({
      chunks: [createWebKitWebmBlob()],
      now: () => 1_777_000_000_000,
      recordedMimeType: 'audio/webm;codecs=opus',
    })

    expect(file.name).toMatch(/^voice-message-\d{8}-\d{6}\.mp3$/)
    expect(file.type).toBe('audio/mp3')
    expect(decodeAudioData).toHaveBeenCalledWith(expect.any(ArrayBuffer))
    expect(mp3EncoderMock).toHaveBeenCalledWith(1, 48000, 64)
  })
})
