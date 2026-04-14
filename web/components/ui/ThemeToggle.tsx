"use client"

import { Sun, Moon } from "lucide-react"
import { useTheme } from "@/lib/theme"

export function ThemeToggle() {
    const { theme, toggle } = useTheme()
    return (
        <button
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
    )
}
