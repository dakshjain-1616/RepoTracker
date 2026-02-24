import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'RepoTracker — AI/ML & SWE Leaderboard',
  description: 'Track the top 100 GitHub repositories across AI/ML and Software Engineering domains.',
  keywords: ['GitHub', 'repositories', 'AI/ML', 'software engineering', 'leaderboard', 'stars'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} min-h-screen bg-background antialiased`}>
        {children}
      </body>
    </html>
  )
}
