import { useIsMobile } from '@/lib/useIsMobile'
import { CommandCentre as DesktopCommandCentre } from './CommandCentre'
import { MobileCommandCentre } from './MobileCommandCentre'

/**
 * Renders the iOS-style hero/list mobile layout on phones, and the
 * dense bordered-card grid on desktop.
 */
export function CommandCentreSwitch() {
  const isMobile = useIsMobile()
  return isMobile ? <MobileCommandCentre /> : <DesktopCommandCentre />
}
