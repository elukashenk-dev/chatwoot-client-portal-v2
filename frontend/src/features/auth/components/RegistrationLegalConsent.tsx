import { Link } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'

export type RegistrationLegalConsentValue = {
  personalDataConsentAccepted: boolean
  termsAccepted: boolean
}

export function RegistrationLegalConsent({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean
  onChange: (value: RegistrationLegalConsentValue) => void
  value: RegistrationLegalConsentValue
}) {
  return (
    <fieldset className="auth-legal-consent">
      <label>
        <input
          checked={value.termsAccepted}
          disabled={disabled}
          onChange={(event) => {
            onChange({
              ...value,
              termsAccepted: event.currentTarget.checked,
            })
          }}
          type="checkbox"
        />
        <span>
          Я принимаю{' '}
          <Link to={routePaths.legal.terms}>Пользовательское соглашение</Link>
        </span>
      </label>

      <label>
        <input
          checked={value.personalDataConsentAccepted}
          disabled={disabled}
          onChange={(event) => {
            onChange({
              ...value,
              personalDataConsentAccepted: event.currentTarget.checked,
            })
          }}
          type="checkbox"
        />
        <span>
          Я даю согласие на обработку персональных данных и подтверждаю, что
          ознакомлен с{' '}
          <Link to={routePaths.legal.privacy}>
            Политикой обработки персональных данных
          </Link>
        </span>
      </label>
    </fieldset>
  )
}
