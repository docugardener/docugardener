import { NextResponse } from "next/server"
import { getOwnerSession } from "@/lib/owner-auth"

export async function GET() {
  const owner = await getOwnerSession()
  if (!owner) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true, owner })
}
