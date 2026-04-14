
import { PrismaClient } from "@prisma/client"

async function main() {
    const prisma = new PrismaClient()
    await prisma.$connect()

    const users = await prisma.user.findMany()
    console.log("--- USERS ---")
    users.forEach(u => {
        console.log(`User: ${u.email} Role: ${u.role} ID: ${u.id}`)
    })
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        const prisma = new PrismaClient()
        await prisma.$disconnect()
    })
