// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
    title: string
    description?: string
    subtitle?: ReactNode
    actions?: ReactNode
    children?: ReactNode
    className?: string
}

export function PageHeader({ title, description, subtitle, actions, children, className }: PageHeaderProps) {
    return (
        <div className={cn("bg-card border-b border-border mb-6 py-5", className)}>
            <div className="app-container">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                    <div className="space-y-1">
                        {subtitle}
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">
                            {title}
                        </h1>
                        {description && (
                            <p className="text-muted-foreground text-sm font-medium">
                                {description}
                            </p>
                        )}
                    </div>
                    {actions && (
                        <div className="flex gap-2">
                            {actions}
                        </div>
                    )}
                </div>

                {children}
            </div>
        </div>
    )
}
