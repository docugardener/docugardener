
import { PrismaClient } from "@prisma/client"

async function main() {
    const prisma = new PrismaClient()
    await prisma.$connect()

    console.log("--- DEBUG: Tenants ---")
    const tenants = await prisma.tenant.findMany()
    console.log(JSON.stringify(tenants, null, 2))

    console.log("\n--- DEBUG: Recent Jobs ---")
    const jobs = await prisma.job.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { repository: true }
    })

    jobs.forEach(j => {
        console.log(`Job ${j.id}: PR #${j.prNumber} Status=${j.status} Tenant=${j.tenantId} Score=${(j.result as any)?.drift_score}`)
    })
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        const prisma = new PrismaClient()
        await prisma.$disconnect()
    })
