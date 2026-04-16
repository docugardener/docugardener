
import { PrismaClient } from "@prisma/client"

async function main() {
    const prisma = new PrismaClient()
    await prisma.$connect()

    const email = process.env.PROMOTE_EMAIL ?? "admin@example.com"

    console.log(`Promoting ${email} to ADMIN...`)
    const user = await prisma.user.update({
        where: { email },
        data: { role: 'ADMIN' }
    })

    console.log(`User ${user.email} is now ${user.role}`)
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        const prisma = new PrismaClient()
        await prisma.$disconnect()
    })
