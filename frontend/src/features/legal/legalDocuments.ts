export type LegalDocumentId = 'privacy' | 'terms'

export const legalDocumentVersion = '2026-06-16'

export const legalDocuments = {
  privacy: {
    title: 'Политика обработки персональных данных',
    version: legalDocumentVersion,
    body: [
      'Тестовая редакция для проверки интерфейса. Перед production текст заменяется утвержденной редакцией оператора.',
    ],
  },
  terms: {
    title: 'Пользовательское соглашение',
    version: legalDocumentVersion,
    body: [
      'Тестовая редакция для проверки интерфейса. Перед production текст заменяется утвержденной редакцией оператора.',
    ],
  },
} as const satisfies Record<
  LegalDocumentId,
  {
    body: string[]
    title: string
    version: string
  }
>
