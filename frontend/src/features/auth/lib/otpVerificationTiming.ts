export function calculateResendCountdown(
  requestedAt: number,
  resendAvailableInSeconds: number,
) {
  const resendAt = requestedAt + resendAvailableInSeconds * 1000

  return Math.max(0, Math.ceil((resendAt - Date.now()) / 1000))
}
