import type { ChatSendResult } from '../types'

const privateThread = {
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
} as const

export function createBatchAttachmentSendResult(): ChatSendResult {
  return {
    activeThread: privateThread,
    reason: 'none',
    result: 'ready',
    sentMessage: {
      attachments: [
        {
          fileSize: 1024,
          fileType: 'file',
          id: 77,
          name: 'signed-act.pdf',
          thumbUrl: '',
          url: '/api/chat/threads/private%3Ame/attachments/601/77',
        },
        {
          fileSize: 512,
          fileType: 'file',
          id: 78,
          name: 'notes.txt',
          thumbUrl: '',
          url: '/api/chat/threads/private%3Ame/attachments/601/78',
        },
      ],
      authorName: 'Вы',
      authorRole: 'current_user',
      content: 'Черновик остается',
      contentType: 'text',
      createdAt: '2026-04-21T09:35:00.000Z',
      direction: 'outgoing',
      id: 601,
      status: 'sent',
    },
  }
}

export function createVoiceAttachmentSendResult(): ChatSendResult {
  return {
    activeThread: privateThread,
    reason: 'none',
    result: 'ready',
    sentMessage: {
      attachments: [
        {
          fileSize: 11,
          fileType: 'audio',
          id: 78,
          name: 'voice-message.webm',
          thumbUrl: '',
          url: '/api/chat/threads/private%3Ame/attachments/602/78',
        },
      ],
      authorName: 'Вы',
      authorRole: 'current_user',
      content: null,
      contentType: 'text',
      createdAt: '2026-04-21T09:36:00.000Z',
      direction: 'outgoing',
      id: 602,
      status: 'sent',
    },
  }
}
