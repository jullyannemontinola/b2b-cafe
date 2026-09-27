"use client"

import { Button } from "@/components/ui/button"

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="panel mx-auto max-w-md space-y-4 px-6 py-12 text-center">
      <h1 className="text-2xl">This page couldn’t load</h1>
      <p className="text-muted-foreground">
        The scheduling service didn’t respond. Check your connection and try again.
      </p>
      <Button size="lg" onClick={reset}>Try again</Button>
    </div>
  )
}
