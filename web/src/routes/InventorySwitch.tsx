import { useIsMobile } from '@/lib/useIsMobile'
import { Inventory as DesktopInventory } from './Inventory'
import { MobileInventory } from './MobileInventory'

export function InventorySwitch() {
  const isMobile = useIsMobile()
  return isMobile ? <MobileInventory /> : <DesktopInventory />
}
