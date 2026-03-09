import React, { type ReactNode } from 'react'
import { Sidebar } from './Sidebar'

interface AppLayoutProps {
  children: ReactNode
}

/**
 * Root layout: sidebar on the left, main content area on the right.
 * The sidebar handles its own width via inline style + CSS transition.
 * The main area fills the remaining space.
 */
export function AppLayout({ children }: AppLayoutProps): React.JSX.Element {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <main className="relative flex flex-1 flex-col overflow-hidden">
        {/* Drag region for main content area (macOS title bar) */}
        <div className="h-[38px] shrink-0 [-webkit-app-region:drag]" />
        {children}
      </main>
    </div>
  )
}
