// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { createContext, useContext, useEffect, useState } from "react"

type Theme = "dark" | "light"

interface ThemeCtx { theme: Theme; toggle: () => void }
const ThemeContext = createContext<ThemeCtx>({ theme: "dark", toggle: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>("dark")

    useEffect(() => {
        const saved = localStorage.getItem("dg-theme") as Theme | null
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
        const initial: Theme = saved ?? (prefersDark ? "dark" : "light")
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTheme(initial)
        document.documentElement.classList.toggle("dark", initial === "dark")
    }, [])

    function toggle() {
        setTheme(prev => {
            const next: Theme = prev === "dark" ? "light" : "dark"
            localStorage.setItem("dg-theme", next)
            document.documentElement.classList.toggle("dark", next === "dark")
            return next
        })
    }

    return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

export function useTheme() { return useContext(ThemeContext) }
