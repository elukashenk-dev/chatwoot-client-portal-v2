export type TelegramBridgeAdminStatus = {
  chatwootTelegramInboxId: number
  displayName: string
  lastWebhookCheckedAt: string | null
  lastWebhookHost: string | null
  lastWebhookOwner: string | null
  publicKey: string
  status: string
  telegramBotId: string
  telegramBotUsername: string
  webhookConfigured: boolean
}
