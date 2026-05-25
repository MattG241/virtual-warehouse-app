import { useIsMobile } from '@/lib/useIsMobile'
import { Warehouse as DesktopWarehouse } from './Warehouse'
import { MobileWarehouse } from './MobileWarehouse'

export function WarehouseSwitch() {
  const isMobile = useIsMobile()
  return isMobile ? <MobileWarehouse /> : <DesktopWarehouse />
}
