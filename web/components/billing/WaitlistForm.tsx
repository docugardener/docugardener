// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface WaitlistFormProps {
  plan: "pro" | "team"
  onSuccess: () => void
}

const PLAN_LABELS: Record<"pro" | "team", string> = {
  pro: "Pro — $29/mo",
  team: "Team — $79/mo",
}

export function WaitlistForm({ plan, onSuccess }: WaitlistFormProps) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (success) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
        You&apos;re on the list! We&apos;ll be in touch.
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name: name || undefined,
          plan,
          message: message || undefined,
        }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setError(data.error ?? "Something went wrong. Please try again.")
        return
      }

      setSuccess(true)
      onSuccess()
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <div className="space-y-1">
        <Label htmlFor="waitlist-name">Name</Label>
        <Input
          id="waitlist-name"
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          disabled={loading}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="waitlist-email">
          Email <span className="text-destructive">*</span>
        </Label>
        <Input
          id="waitlist-email"
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />
      </div>

      <div className="space-y-1">
        <Label>Plan interest</Label>
        <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {PLAN_LABELS[plan]}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="waitlist-message">Message</Label>
        <Textarea
          id="waitlist-message"
          placeholder="Anything you'd like us to know?"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
          rows={3}
          disabled={loading}
        />
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Submitting…" : "Reserve your spot →"}
      </Button>
    </form>
  )
}
