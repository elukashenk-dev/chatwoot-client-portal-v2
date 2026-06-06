import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { TenantAuthShell } from '../../tenant/components/TenantAuthShell'
import {
  requestAdminLoginCode,
  verifyAdminLoginCode,
  type AdminLoginRequestResponse,
} from '../api/adminAuthClient'
import { AdminCodeStep } from '../components/AdminCodeStep'
import { AdminEmailStep } from '../components/AdminEmailStep'
import { useAdminSession } from '../lib/adminSessionContext'

type LoginStep = 'email' | 'code'

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function getInfoMessage(response: AdminLoginRequestResponse) {
  return response.delivery === 'existing_pending'
    ? 'Код уже отправлен. Проверьте почту или дождитесь повторной отправки.'
    : `Код отправлен на ${response.email}.`
}

function getSafeAdminReturnPath(state: unknown) {
  if (
    state &&
    typeof state === 'object' &&
    'from' in state &&
    state.from &&
    typeof state.from === 'object' &&
    'pathname' in state.from &&
    typeof state.from.pathname === 'string' &&
    (state.from.pathname === routePaths.admin.root ||
      state.from.pathname.startsWith(`${routePaths.admin.root}/`)) &&
    state.from.pathname !== routePaths.admin.login
  ) {
    return state.from.pathname
  }

  return routePaths.admin.branding
}

export function AdminLoginPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { setVerifiedSession } = useAdminSession()
  const [step, setStep] = useState<LoginStep>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const [isRequesting, setIsRequesting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [secondsRemaining, setSecondsRemaining] = useState(0)

  useEffect(() => {
    if (secondsRemaining <= 0) {
      return
    }

    const timerId = window.setInterval(() => {
      setSecondsRemaining((currentSeconds) => Math.max(0, currentSeconds - 1))
    }, 1000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [secondsRemaining])

  async function handleRequestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setInfoMessage(null)
    setIsRequesting(true)

    try {
      const response = await requestAdminLoginCode({ email: email.trim() })

      setEmail(response.email)
      setCode('')
      setSecondsRemaining(response.resendAvailableInSeconds)
      setInfoMessage(getInfoMessage(response))
      setStep('code')
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          'Не удалось отправить код администратора. Попробуйте еще раз.',
        ),
      )
    } finally {
      setIsRequesting(false)
    }
  }

  async function handleResendCode() {
    setErrorMessage(null)
    setIsResending(true)

    try {
      const response = await requestAdminLoginCode({ email })

      setEmail(response.email)
      setSecondsRemaining(response.resendAvailableInSeconds)
      setInfoMessage(getInfoMessage(response))
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          'Не удалось отправить код повторно. Попробуйте еще раз.',
        ),
      )
    } finally {
      setIsResending(false)
    }
  }

  function handleChangeEmail() {
    setCode('')
    setErrorMessage(null)
    setInfoMessage(null)
    setSecondsRemaining(0)
    setStep('email')
  }

  async function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setIsVerifying(true)

    try {
      const session = await verifyAdminLoginCode({ code, email })

      setVerifiedSession(session)
      navigate(getSafeAdminReturnPath(location.state), { replace: true })
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          'Не удалось подтвердить вход. Проверьте код и попробуйте еще раз.',
        ),
      )
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <TenantAuthShell
      description={
        step === 'email'
          ? 'Введите email администратора, чтобы получить код входа.'
          : 'Код действует ограниченное время и нужен только для входа в админку портала.'
      }
      title={step === 'email' ? 'Вход в админ-консоль' : 'Подтвердите вход'}
    >
      {step === 'email' ? (
        <AdminEmailStep
          email={email}
          errorMessage={errorMessage}
          isSubmitting={isRequesting}
          onEmailChange={setEmail}
          onSubmit={handleRequestCode}
        />
      ) : (
        <AdminCodeStep
          code={code}
          email={email}
          errorMessage={errorMessage}
          infoMessage={infoMessage}
          isResending={isResending}
          isSubmitting={isVerifying}
          onChangeEmail={handleChangeEmail}
          onCodeChange={setCode}
          onResend={() => {
            void handleResendCode()
          }}
          onSubmit={handleVerifyCode}
          secondsRemaining={secondsRemaining}
        />
      )}
    </TenantAuthShell>
  )
}
