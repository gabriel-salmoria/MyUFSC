import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { ThemeToggle } from "@/components/theme-toggle";
import { Github } from "lucide-react";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

import { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL("https://myufsc.vercel.app"),
  title: "MyUFSC",
  description: "Planeje e organize sua grade curricular universitária do começo ao fim. Plataforma 100% gratuita, segura e de código aberto.",
  icons: {
    icon: '/icon.jpg',
    apple: '/icon.jpg',
  },
  openGraph: {
    title: "MyUFSC",
    description: "Planeje e organize sua grade curricular universitária do começo ao fim. Plataforma 100% gratuita, segura e de código aberto.",
    url: "https://myufsc.vercel.app",
    siteName: "MyUFSC",
    images: [
      {
        url: "/icon.jpg",
        width: 512,
        height: 512,
        alt: "MyUFSC Logo",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "MyUFSC - Planejador de Grade Curricular",
    description: "Planeje e organize sua grade curricular universitária do começo ao fim. Plataforma 100% gratuita, segura e de código aberto.",
    images: ["/icon.jpg"],
  },
  verification: {
    google: "EH4gahostTccN-LRM-LGTdkgjzSSY648CO5X9SddRvA",
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
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
                <div className="flex items-center gap-8">
                  <h1 className="text-xl font-semibold">MyUFSC</h1>
                  <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-full border border-border/50">
                    <span>Esse projeto é de código livre, aberto e 100% gratuito!</span>
                    <a
                      href="https://github.com/gabriel-salmoria/MyUFSC"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-primary transition-colors font-medium ml-1 text-foreground"
                    >
                      <Github className="w-4 h-4" />
                      Repositório
                    </a>
                  </div>
                </div>
                <ThemeToggle />
              </div>
            </header>
            <main className="w-full mx-auto px-4 py-8">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
