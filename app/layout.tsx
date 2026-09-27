import type { Metadata } from "next"
import { Manrope } from "next/font/google"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

// Manrope (SIL OFL): a rounded, friendly sans close in feel to the reference type.
const body = Manrope({ variable: "--font-body", subsets: ["latin"] })

export const metadata: Metadata = {
  title: { default: "B2B Café", template: "%s · B2B Café" },
  description: "Meeting scheduling for approved B2B Café companies, 10–11 November 2026.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster theme="light" position="top-center" richColors={false} />
      </body>
    </html>
  )
}
