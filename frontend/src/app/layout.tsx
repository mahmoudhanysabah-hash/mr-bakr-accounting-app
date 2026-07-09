import type { Metadata } from 'next'
import { Cairo } from 'next/font/google'
import './globals.css'

const cairo = Cairo({ 
  subsets: ['arabic', 'latin'],
  variable: '--font-cairo',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Dr. Bakr Ahmed - SAT & EST Preparation',
  description: 'Premium platform for SAT and EST preparation in Egypt and the Middle East.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ar" dir="rtl" className="scroll-smooth" suppressHydrationWarning>
      <body className={`${cairo.variable} font-cairo antialiased bg-base text-slate-900`}>
        <div className="flex flex-col min-h-screen" suppressHydrationWarning>
          {children}
        </div>
      </body>
    </html>
  )
}
