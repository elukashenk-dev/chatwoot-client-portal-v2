import type { AuthShellProps } from '../../../shared/ui/AuthShell'
import { AuthShell } from '../../../shared/ui/AuthShell'
import { useBranding } from '../../branding/lib/useBranding'
import { createTenantMonogram } from '../lib/tenantIdentityMetadata'
import { useTenantIdentity } from '../lib/useTenantIdentity'

export function TenantAuthShell(props: AuthShellProps) {
  const { branding, status: brandingStatus } = useBranding()
  const { tenant } = useTenantIdentity()
  const brandName =
    props.brandName ??
    (brandingStatus === 'ready'
      ? branding.portalName
      : (tenant?.displayName ?? branding.portalName))
  const brandMonogram =
    props.brandMonogram ??
    (brandName ? createTenantMonogram(brandName) : undefined)
  const brandingLogo = branding.assets.logo

  return (
    <AuthShell
      {...props}
      brandPlacement={
        props.brandPlacement ?? branding.layout.authBrandPlacement
      }
      brandLogoHeight={props.brandLogoHeight ?? brandingLogo?.height}
      brandLogoUrl={props.brandLogoUrl ?? brandingLogo?.publicUrl}
      brandLogoWidth={props.brandLogoWidth ?? brandingLogo?.width}
      brandMonogram={brandMonogram}
      brandName={brandName}
    />
  )
}
