import { Inter } from "next/font/google"
import { ThemeProvider } from "next-themes"
import { ThemeToggle } from "@/components/theme-toggle"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="min-h-screen bg-background text-foreground">
            <header className="border-b border-border">
              <div className="container mx-auto px-4 py-4 flex items-center justify-between">
                <h1 className="text-xl font-semibold">Semester Planner</h1>
                <ThemeToggle />
              </div>
            </header>
            <main className="w-[98vw] mx-auto px-4 py-8">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}