
import { PrismaClient } from "@prisma/client"

async function main() {
    const prisma = new PrismaClient()
    await prisma.$connect()

    const job = await prisma.job.findFirst({
        where: { status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' }
    })

    if (job) {
        console.log("--- RESULT ---")
        console.log(JSON.stringify(job.result, null, 2))
        console.log("--- LOGS ---")
        console.log(JSON.stringify(job.logs, null, 2))
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        const prisma = new PrismaClient()
        await prisma.$disconnect()
    })
