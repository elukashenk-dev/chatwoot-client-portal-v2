import type { AuthenticatedPortalUser } from '../auth/service.js'
import { PASSWORDLESS_LOGIN_PURPOSE } from './repository.js'

export type PasswordlessLoginRequestResult = {
  accepted: true
  email: string
  expiresInSeconds: number
  nextStep: 'verify_code'
  purpose: 'passwordless_login'
  resendAvailableInSeconds: number
  result: 'passwordless_login_requested'
}

export type PasswordlessLoginCompletedSession = {
  nextStep: 'chat'
  purpose: 'passwordless_login'
  result: 'passwordless_login_completed'
  session: {
    expiresAt: Date
  }
  sessionToken: string
  user: AuthenticatedPortalUser
}

export type PasswordlessLoginLegalRequired = {
  continuationExpiresInSeconds: number
  continuationToken: string
  email: string
  nextStep: 'accept_legal'
  purpose: 'passwordless_login'
  result: 'legal_acceptance_required'
}

export type PasswordlessLoginVerifyResult =
  | PasswordlessLoginCompletedSession
  | PasswordlessLoginLegalRequired

export function calculateSecondsUntil(target: Date, now: Date) {
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 1000))
}

export function buildCompletedResponse({
  session,
  sessionToken,
  user,
}: Pick<
  PasswordlessLoginCompletedSession,
  'session' | 'sessionToken' | 'user'
>): PasswordlessLoginCompletedSession {
  return {
    nextStep: 'chat',
    purpose: PASSWORDLESS_LOGIN_PURPOSE,
    result: 'passwordless_login_completed',
    session: {
      expiresAt: session.expiresAt,
    },
    sessionToken,
    user,
  }
}

export function buildLegalRequiredResponse({
  continuationExpiresAt,
  continuationToken,
  email,
  now,
}: {
  continuationExpiresAt: Date
  continuationToken: string
  email: string
  now: Date
}): PasswordlessLoginLegalRequired {
  return {
    continuationExpiresInSeconds: calculateSecondsUntil(
      continuationExpiresAt,
      now,
    ),
    continuationToken,
    email,
    nextStep: 'accept_legal',
    purpose: PASSWORDLESS_LOGIN_PURPOSE,
    result: 'legal_acceptance_required',
  }
}

export function buildRequestResponse({
  email,
  expiresAt,
  now,
  resendNotBefore,
}: {
  email: string
  expiresAt: Date
  now: Date
  resendNotBefore: Date
}): PasswordlessLoginRequestResult {
  return {
    accepted: true,
    email,
    expiresInSeconds: calculateSecondsUntil(expiresAt, now),
    nextStep: 'verify_code',
    purpose: PASSWORDLESS_LOGIN_PURPOSE,
    resendAvailableInSeconds: calculateSecondsUntil(resendNotBefore, now),
    result: 'passwordless_login_requested',
  }
}
