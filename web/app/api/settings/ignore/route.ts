import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import fs from "fs/promises"
import path from "path"

// Target the project root .dgignore (parent of web directory)
const IGNORE_FILE_PATH = path.join(process.cwd(), "..", ".dgignore")

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || !session.user) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    try {
        const content = await fs.readFile(IGNORE_FILE_PATH, "utf-8")
        return NextResponse.json({ content })
    } catch (error) {
        // If file doesn't exist, return empty
        return NextResponse.json({ content: "" })
    }
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    // @ts-ignore
    if (!session || session.user?.role !== "ADMIN") {
        return new NextResponse("Forbidden", { status: 403 })
    }

    const { content } = await req.json()

    try {
        await fs.writeFile(IGNORE_FILE_PATH, content, "utf-8")
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Failed to save .dgignore", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
