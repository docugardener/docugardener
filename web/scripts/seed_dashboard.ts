
import { PrismaClient } from "@prisma/client"

async function main() {
    const prisma = new PrismaClient()
    await prisma.$connect()

    // 1. Get the user's tenant
    const userEmail = process.env.SEED_USER_EMAIL ?? "admin@example.com"
    const user = await prisma.user.findUnique({
        where: { email: userEmail },
        include: { tenant: true }
    })

    if (!user || !user.tenantId) {
        console.error("❌ User or Tenant not found for " + userEmail)
        return
    }

    const tenantId = user.tenantId
    console.log(`🌱 Seeding data for Tenant: ${tenantId} (${user.tenant?.name})`)

    // 2. Create a Repository if it doesn't exist
    let repo = await prisma.repository.findFirst({
        where: { tenantId, name: "docugardener-demo" }
    })

    if (!repo) {
        repo = await prisma.repository.create({
            data: {
                tenantId,
                name: "docugardener-demo",
                githubRepoId: "12345678",
                enabled: true
            }
        })
        console.log("✅ Created Repository: docugardener-demo")
    } else {
        console.log("ℹ️ Repository docugardener-demo already exists")
    }

    // 3. Create Sample Jobs
    await prisma.job.createMany({
        data: [
            {
                tenantId,
                repositoryId: repo.id,
                prNumber: 101,
                status: "COMPLETED",
                result: { drift_score: 95, summary: "Critical drift in payment API signatures." },
                createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2) // 2 hours ago
            },
            {
                tenantId,
                repositoryId: repo.id,
                prNumber: 102,
                status: "COMPLETED",
                result: { drift_score: 15, summary: "Minor docstring update, perfectly synced." },
                createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24) // 1 day ago
            },
            {
                tenantId,
                repositoryId: repo.id,
                prNumber: 103,
                status: "PROCESSING",
                createdAt: new Date()
            },
            {
                tenantId,
                repositoryId: repo.id,
                prNumber: 104,
                status: "FAILED",
                logs: ["Error connection to GitHub API", "Retrying..."],
                createdAt: new Date(Date.now() - 1000 * 60 * 30) // 30 mins ago
            }
        ]
    })

    console.log("✅ Created 4 sample jobs.")
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        const prisma = new PrismaClient()
        await prisma.$disconnect()
    })
