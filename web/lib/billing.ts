// SPDX-License-Identifier: AGPL-3.0-or-later
// web/lib/billing.ts
import { PlanType } from "@prisma/client"

export const PLAN_LIMITS = {
    FREE: {
        seats: 1,
        repos: 1,
        prsPerMonth: 50,    // -1 = unlimited
    },
    PRO: {
        seats: 10,
        repos: 5,
        prsPerMonth: 500,
    },
    TEAM: {
        seats: 100,
        repos: 9999, // practically unlimited
        prsPerMonth: -1,
    },
    ENTERPRISE: {
        seats: -1,  // unlimited
        repos: -1,  // unlimited
        prsPerMonth: -1,
    },
}

export function getPlanLimits(plan: string) {
    return PLAN_LIMITS[plan as PlanType] || PLAN_LIMITS.FREE
}

export function canAddUser(currentUsers: number, plan: string): boolean {
    const limits = getPlanLimits(plan)
    return currentUsers < limits.seats
}
