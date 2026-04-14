
import { PrismaClient } from "@prisma/client"

async function main() {
    const prisma = new PrismaClient()
    await prisma.$connect()

    console.log("=== USERS ===")
    const users = await prisma.user.findMany({ include: { tenant: true } })
    users.forEach(u => {
        console.log(`User: ${u.email} | ID: ${u.id} | Tenant: ${u.tenantId} (${u.tenant?.name})`)
    })

    console.log("\n=== TENANTS ===")
    const tenants = await prisma.tenant.findMany()
    tenants.forEach(t => {
        console.log(`Tenant: ${t.name} | ID: ${t.id} | GH Org: ${t.githubOrgId}`)
    })

    console.log("\n=== JOBS (Grouped by Tenant) ===")
    const jobs = await prisma.job.groupBy({
        by: ['tenantId'],
        _count: { id: true }
    })
    jobs.forEach(j => {
        console.log(`Tenant: ${j.tenantId} | Count: ${j._count.id}`)
    })

    console.log("\n=== REPOS (Grouped by Tenant) ===")
    const repos = await prisma.repository.groupBy({
        by: ['tenantId'],
        _count: { id: true }
    })
    repos.forEach(r => {
        console.log(`Tenant: ${r.tenantId} | Count: ${r._count.id}`)
    })
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        const prisma = new PrismaClient()
        await prisma.$disconnect()
    })
