import { prisma } from "@/lib/prisma"

async function main() {
    console.log("🗄️  Testing Database Models...")

    try {
        // 1. Create Tenant (Mocking Onboarding)
        const tenantId = `test-org-${Date.now()}`
        console.log(`Creating Tenant: ${tenantId}...`)

        const tenant = await prisma.tenant.create({
            data: {
                githubOrgId: tenantId,
                name: "Test Org",
                plan: "FREE",
                webhookSecret: "encrypted_secret",
                privateKey: "encrypted_key"
            }
        })
        console.log("✅ Tenant Created:", tenant.id)

        // 2. Create User (Mocking Invite)
        console.log("Creating User...")
        const user = await prisma.user.create({
            data: {
                email: `test-user-${Date.now()}@example.com`,
                role: "ADMIN",
                tenantId: tenant.id
            }
        })
        console.log("✅ User Created:", user.id)

        // 3. Create Repo (Mocking Sync)
        console.log("Creating Repository...")
        const repo = await prisma.repository.create({
            data: {
                name: "test-repo",
                githubRepoId: "12345",
                tenantId: tenant.id,
                config: { threshold: 85 }
            }
        })
        console.log("✅ Repository Created:", repo.id)

        // Cleanup
        console.log("🧹 Cleaning up...")
        await prisma.repository.delete({ where: { id: repo.id } })
        await prisma.user.delete({ where: { id: user.id } })
        await prisma.tenant.delete({ where: { id: tenant.id } })
        console.log("✅ Cleanup Complete")

    } catch (error) {
        console.error("❌ Database Test Failed:", error)
        process.exit(1)
    }
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
