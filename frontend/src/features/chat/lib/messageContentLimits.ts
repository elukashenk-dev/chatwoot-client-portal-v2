export const CHAT_TEXT_MESSAGE_MAX_LENGTH = 4000
export const CHAT_TEXT_MESSAGE_COUNTER_WARNING_LENGTH = 3800

function getCharacterWord(count: number) {
  const absoluteCount = Math.abs(count)
  const lastTwoDigits = absoluteCount % 100
  const lastDigit = absoluteCount % 10

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return 'символов'
  }

  if (lastDigit === 1) {
    return 'символ'
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'символа'
  }

  return 'символов'
}

export function getTextMessageLengthErrorMessage(length: number) {
  if (length <= CHAT_TEXT_MESSAGE_MAX_LENGTH) {
    return null
  }

  const excessLength = length - CHAT_TEXT_MESSAGE_MAX_LENGTH

  return `Сообщение слишком длинное: ${length} из ${CHAT_TEXT_MESSAGE_MAX_LENGTH}. Сократите на ${excessLength} ${getCharacterWord(excessLength)} или отправьте частями.`
}

export function shouldShowTextMessageLengthCounter(length: number) {
  return length >= CHAT_TEXT_MESSAGE_COUNTER_WARNING_LENGTH
}
