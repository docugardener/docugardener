import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { Octokit } from "octokit";
import { createAppAuth } from "@octokit/auth-app";
import { decrypt } from "@/lib/encryption";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ owner: string; repo: string; path: string[] }> }
) {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any).tenantId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId;

    try {
        const { owner, repo, path } = await params;
        const filePath = path.join("/");
        const searchParams = req.nextUrl.searchParams;
        const ref = searchParams.get("ref");

        if (!ref) {
            return NextResponse.json({ error: "Missing required 'ref' parameter indicating the commit SHA." }, { status: 400 });
        }

        // --- DEMO MOCK FALLBACK ---
        if (repo === "docugardener-demo") {
            let mockContent = "// Source file content\n";
            if (filePath === "src/core/config.ts") {
                mockContent = `export const AppConfig = {
    apiKey: process.env.API_KEY,
    dbUrl: process.env.DB_URL,
};`;
            } else if (filePath === "src/main.ts") {
                mockContent = `import Fastify from 'fastify';\nimport { AppConfig } from './core/config';\n\nconst server = Fastify();\nserver.listen({ port: 8080 });`;
            } else {
                mockContent = `// Mock content for ${filePath} at ${ref}`;
            }

            return NextResponse.json({
                content: mockContent,
                path: filePath,
                ref: ref
            });
        }
        // --- END DEMO MOCK ---

        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId }
        });

        // @ts-ignore - Prisma types might be out of sync
        if (!tenant || !tenant.appId || !tenant.privateKey || !tenant.installationId) {
            return NextResponse.json({ error: "GitHub App not fully configured." }, { status: 400 });
        }

        const privateKey = decrypt(tenant.privateKey as string);
        const octokit = new Octokit({
            authStrategy: createAppAuth,
            auth: {
                appId: tenant.appId as string,
                privateKey: privateKey,
                installationId: Number(tenant.installationId),
            }
        });

        const { data } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: filePath,
            ref,
            mediaType: {
                format: "raw", // Request the raw unencoded file content directly
            }
        });

        return NextResponse.json({
            content: data as unknown as string,
            path: filePath,
            ref: ref
        });

    } catch (error: any) {
        console.error("Failed to fetch repository content via LiveCodeBlock API proxy:", error);

        let statusCode = 500;
        let errorMessage = "Failed to fetch code snippet from GitHub.";

        if (error.status === 404) {
            statusCode = 404;
            const p = await params;
            errorMessage = `File '${p.path.join("/")}' not found at commit ref '${req.nextUrl.searchParams.get("ref")}'.`;
        }

        return NextResponse.json({
            error: errorMessage,
            details: error.message
        }, { status: statusCode });
    }
}
