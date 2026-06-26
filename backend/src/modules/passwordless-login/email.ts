import type { EmailMessage } from '../../integrations/email/smtp.js'

export function buildPasswordlessLoginEmail({
  code,
  to,
}: {
  code: string
  to: string
}): EmailMessage {
  return {
    subject: 'Код входа в Client Portal',
    text: [
      'Ваш код входа в Client Portal:',
      '',
      code,
      '',
      'Код действует 15 минут.',
      'Если вы не запрашивали вход, просто проигнорируйте это письмо.',
    ].join('\n'),
    to,
  }
}
