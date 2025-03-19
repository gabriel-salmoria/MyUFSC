import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'semester planner',
  description: 'plan your semester',
  generator: 'semester planner',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}