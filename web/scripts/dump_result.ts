
import { PrismaClient } from "@prisma/client"

async function main() {
    const prisma = new PrismaClient()
    await prisma.$connect()

    const job = await prisma.job.findFirst({
        where: { status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' }
    })

    if (job) {
        console.log(JSON.stringify(job.result, null, 2))
    } else {
        console.log("No completed jobs found.")
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        const prisma = new PrismaClient()
        await prisma.$disconnect()
    })
