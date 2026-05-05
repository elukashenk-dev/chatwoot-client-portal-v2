import type { AuthShellProps } from '../../../shared/ui/AuthShell'
import { AuthShell } from '../../../shared/ui/AuthShell'
import { createTenantMonogram } from '../lib/tenantIdentityMetadata'
import { useTenantIdentity } from '../lib/useTenantIdentity'

export function TenantAuthShell(props: AuthShellProps) {
  const { tenant } = useTenantIdentity()

  return (
    <AuthShell
      {...props}
      brandMonogram={
        tenant ? createTenantMonogram(tenant.displayName) : props.brandMonogram
      }
      brandName={tenant?.displayName ?? props.brandName}
    />
  )
}
