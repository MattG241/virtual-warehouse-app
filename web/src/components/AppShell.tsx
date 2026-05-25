import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { MobileTabBar } from './MobileTabBar'
import { SearchOverlay } from '@/features/search/SearchOverlay'

interface Props {
  title: string
  children: ReactNode
}

export function AppShell({ title, children }: Props) {
  return (
    <div className="flex min-h-dvh bg-bg text-ink">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-3 sm:px-6 lg:px-8 lg:pb-8">
          <Topbar title={title} />
          {children}
        </main>
        <MobileTabBar />
      </div>
      <SearchOverlay />
    </div>
  )
}
