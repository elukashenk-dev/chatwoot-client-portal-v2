import type {
  ChatMediaCategory,
  PortalChatMediaItem,
  PortalChatMessage,
} from './types.js'

export function getMediaItemCategory(fileType: string): ChatMediaCategory {
  const normalizedFileType = fileType.trim().toLowerCase()

  if (
    normalizedFileType === 'image' ||
    normalizedFileType.startsWith('image/')
  ) {
    return 'image'
  }

  if (
    normalizedFileType === 'video' ||
    normalizedFileType.startsWith('video/')
  ) {
    return 'video'
  }

  if (
    normalizedFileType === 'audio' ||
    normalizedFileType.startsWith('audio/')
  ) {
    return 'audio'
  }

  return 'file'
}

export function buildPortalChatMediaItems(
  messages: PortalChatMessage[],
): PortalChatMediaItem[] {
  return messages.flatMap((message) =>
    message.attachments.map((attachment) => ({
      attachmentId: attachment.id,
      authorName: message.authorName,
      authorRole: message.authorRole,
      category: getMediaItemCategory(attachment.fileType),
      createdAt: message.createdAt,
      direction: message.direction,
      fileSize: attachment.fileSize,
      fileType: attachment.fileType,
      id: `attachment:${message.id}:${attachment.id}`,
      messageId: message.id,
      name: attachment.name,
      thumbUrl: attachment.thumbUrl,
      url: attachment.url,
    })),
  )
}
