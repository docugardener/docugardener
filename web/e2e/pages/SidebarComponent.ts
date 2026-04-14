import { Page, expect, Locator } from "@playwright/test"
import { Role } from "../fixtures/auth"

const NAV_BY_ROLE: Record<Role, string[]> = {
    ADMIN: ["Inbox", "Jobs", "Reports", "Audit Log", "Team", "Billing", "Settings"],
    AUDITOR: ["Jobs", "Reports", "Audit Log"],
    BILLING_ADMIN: ["Reports", "Billing"],
    VIEWER: ["Inbox", "Jobs", "Reports"],
}

const NAV_ABSENT_BY_ROLE: Record<Role, string[]> = {
    ADMIN: [],
    AUDITOR: ["Inbox", "Team", "Billing", "Settings", "Developer Tools"],
    BILLING_ADMIN: ["Inbox", "Jobs", "Audit Log", "Team", "Settings"],
    VIEWER: ["Audit Log", "Team", "Billing", "Settings"],
}

export class SidebarComponent {
    private sidebar: Locator

    constructor(private page: Page) {
        this.sidebar = page.locator('[data-sidebar="true"]')
    }

    async assertNavItems(role: Role) {
        for (const label of NAV_BY_ROLE[role]) {
            await expect(this.sidebar.getByRole("link", { name: label })).toBeVisible()
        }
    }

    async assertNavAbsent(role: Role) {
        for (const label of NAV_ABSENT_BY_ROLE[role]) {
            await expect(this.sidebar.getByRole("link", { name: label })).not.toBeVisible()
        }
    }

    async assertNavItemAbsent(label: string) {
        await expect(this.sidebar.getByRole("link", { name: label })).not.toBeVisible()
    }

    async assertRoleBadge(role: Role) {
        // Target the Badge element specifically (data-slot="badge")
        await expect(this.sidebar.locator('[data-slot="badge"]').getByText(role, { exact: true })).toBeVisible()
    }

    async clickSignOut() {
        await this.sidebar.getByRole("button", { name: /sign out/i }).click()
    }
}
