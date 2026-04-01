import './globals.css'

export const metadata = {
  title: 'Offshore Construction AI',
  description: 'Advanced document generation for offshore wind, subsea cables, heavy lifting and marine construction operations.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
