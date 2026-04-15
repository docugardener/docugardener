export const dynamic = "force-dynamic"
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { spawn } from "child_process"
import path from "path"

import fs from "fs"

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || !session.user) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const { diff, filename, tone } = await req.json()
    const tenantId = session.user.tenantId || "default"

    if (!diff) {
        return new NextResponse("Missing diff content", { status: 400 })
    }

    const scriptPath = path.resolve(process.cwd(), "..", "scripts", "api_simulate_drift.py")

    try {
        const result = await runSimulationScript(scriptPath, { diff, filename, tone, tenantId })
        return NextResponse.json(result)
    } catch (error: any) {
        console.error("Simulation failed", error)
        return new NextResponse(JSON.stringify({ error: "Simulation failed", details: error.message }), { status: 500 })
    }
}

function runSimulationScript(scriptPath: string, input: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const projectRoot = path.resolve(process.cwd(), "..")

        let pythonCommand = "python3"
        const venvPython = path.join(projectRoot, ".venv", "bin", "python3")

        if (fs.existsSync(venvPython)) {
            pythonCommand = venvPython
        }

        const rawDbUrl = process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/docugardener-web"
        const cleanDbUrl = rawDbUrl.split('?')[0]

        const pythonProcess = spawn(pythonCommand, [scriptPath], {
            env: {
                ...process.env,
                PYTHONPATH: projectRoot,
                GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
                SQL_DATABASE_URL: cleanDbUrl,
            },
        })
        let outputData = ""
        let errorData = ""

        // Write input to stdin
        pythonProcess.stdin.write(JSON.stringify(input))
        pythonProcess.stdin.end()

        pythonProcess.stdout.on("data", (data) => {
            outputData += data.toString()
        })

        pythonProcess.stderr.on("data", (data) => {
            errorData += data.toString()
        })

        pythonProcess.on("close", (code) => {
            if (code !== 0) {
                reject(new Error(errorData || "Script exited with non-zero code"))
                return
            }

            // Expose the successful Python stderr logs to the Next.js console
            if (errorData) {
                console.log("[Python Simulator Log]:\n" + errorData.trim())
            }

            try {
                const result = JSON.parse(outputData)
                resolve(result)
            } catch (e) {
                reject(new Error("Failed to parse script output: " + outputData))
            }
        })
    })
}
