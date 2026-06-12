import type { Metadata } from 'next'
import { Geist, JetBrains_Mono, Patrick_Hand_SC } from 'next/font/google'
import './globals.css'

const geistSans = Geist({ subsets: ['latin'] })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })
const patrickHand = Patrick_Hand_SC({ weight: '400', subsets: ['latin'], variable: '--font-hand' })

export const metadata: Metadata = {
  title: "CardRadar — India's Credit Card Intelligence Platform",
  description:
    'Track rewards. Detect devaluations. Find your best card. The only tool built for serious Indian cardholders.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.className} ${jetbrainsMono.variable} ${patrickHand.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
