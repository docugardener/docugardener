export const dynamic = "force-dynamic"
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import nodemailer from "nodemailer"

const WaitlistSchema = z.object({
  email: z.string().email(),
  name: z.string().max(100).optional(),
  plan: z.enum(["pro", "team"]),
  message: z.string().max(500).optional(),
})

// Simple in-memory rate limiter: IP -> { count, hourStart }
const rateLimitMap = new Map<string, { count: number; hourStart: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const hourMs = 60 * 60 * 1000
  const entry = rateLimitMap.get(ip)

  if (!entry || now - entry.hourStart >= hourMs) {
    rateLimitMap.set(ip, { count: 1, hourStart: now })
    return false
  }

  if (entry.count >= 5) {
    return true
  }

  entry.count += 1
  return false
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  )
}

async function sendOwnerNotification(data: {
  email: string
  name?: string
  plan: string
  message?: string
}): Promise<void> {
  const ownerEmail = process.env.OWNER_EMAIL
  if (!ownerEmail) return

  const smtpHost = process.env.SMTP_HOST
  const smtpPort = parseInt(process.env.SMTP_PORT ?? "587", 10)
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS

  if (!smtpHost || !smtpUser || !smtpPass) return

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  })

  const planLabel = data.plan === "pro" ? "Pro — $29/mo" : "Team — $79/mo"
  const subject = `[DocuGardener] New waitlist signup: ${data.email} (${planLabel})`
  const text = [
    `New waitlist entry received:`,
    ``,
    `Email:   ${data.email}`,
    `Name:    ${data.name ?? "(not provided)"}`,
    `Plan:    ${planLabel}`,
    `Message: ${data.message ?? "(none)"}`,
  ].join("\n")

  await transporter.sendMail({
    from: smtpUser,
    to: ownerEmail,
    subject,
    text,
  })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req)

  if (isRateLimited(ip)) {
    // Return ok:true to avoid leaking rate limit info to harvesters
    return NextResponse.json({ ok: true })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = WaitlistSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    )
  }

  const { email, name, plan, message } = parsed.data

  await prisma.waitlistEntry.create({
    data: { email, name, plan, message },
  })

  try {
    await sendOwnerNotification({ email, name, plan, message })
  } catch (err) {
    console.error("[waitlist] SMTP notification failed:", err)
    // DB row is source of truth — do not fail the request
  }

  return NextResponse.json({ ok: true })
}
