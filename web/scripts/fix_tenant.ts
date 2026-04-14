
import { PrismaClient } from "@prisma/client"

async function main() {
    const prisma = new PrismaClient()
    await prisma.$connect()

    const targetTenantId = "cmksweddx0000bobblrgpez2c" // The active user's tenant
    const sourceTenantId = "verify-tenant" // The worker's default tenant

    console.log(`Migrating jobs from ${sourceTenantId} to ${targetTenantId}...`)

    const result = await prisma.job.updateMany({
        where: { tenantId: sourceTenantId },
        data: { tenantId: targetTenantId }
    })

    console.log(`✅ Migrated ${result.count} jobs.`)
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        const prisma = new PrismaClient()
        await prisma.$disconnect()
    })
