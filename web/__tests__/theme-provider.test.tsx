import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"
import { ThemeProvider, useTheme } from "@/lib/theme"
import { ThemeToggle } from "@/components/ui/ThemeToggle"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMatchMedia(matches: boolean) {
    return vi.fn().mockReturnValue({ matches, addListener: vi.fn(), removeListener: vi.fn() })
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let localStorageStore: Record<string, string> = {}

const localStorageMock = {
    getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { localStorageStore[key] = value }),
    removeItem: vi.fn((key: string) => { delete localStorageStore[key] }),
    clear: vi.fn(() => { localStorageStore = {} }),
}

beforeEach(() => {
    localStorageStore = {}
    vi.stubGlobal("localStorage", localStorageMock)
    vi.clearAllMocks()
    // Reset html class
    document.documentElement.className = ""
})

afterEach(() => {
    vi.unstubAllGlobals()
})

// ── ThemeConsumer — reads theme from context ───────────────────────────────────

function ThemeConsumer() {
    const { theme } = useTheme()
    return <div data-testid="theme-value">{theme}</div>
}

// ── ThemeProvider tests ───────────────────────────────────────────────────────

describe("ThemeProvider", () => {
    it("applies dark class when localStorage has dark", async () => {
        localStorageStore["dg-theme"] = "dark"
        vi.stubGlobal("window", { ...window, matchMedia: makeMatchMedia(false) })

        await act(async () => {
            render(<ThemeProvider><ThemeConsumer /></ThemeProvider>)
        })

        expect(document.documentElement.classList.contains("dark")).toBe(true)
        expect(screen.getByTestId("theme-value")).toHaveTextContent("dark")
    })

    it("applies light (no dark class) when localStorage has light", async () => {
        localStorageStore["dg-theme"] = "light"
        vi.stubGlobal("window", { ...window, matchMedia: makeMatchMedia(true) })

        await act(async () => {
            render(<ThemeProvider><ThemeConsumer /></ThemeProvider>)
        })

        expect(document.documentElement.classList.contains("dark")).toBe(false)
        expect(screen.getByTestId("theme-value")).toHaveTextContent("light")
    })

    it("uses system preference (dark) when no localStorage value", async () => {
        vi.stubGlobal("window", { ...window, matchMedia: makeMatchMedia(true) })

        await act(async () => {
            render(<ThemeProvider><ThemeConsumer /></ThemeProvider>)
        })

        expect(document.documentElement.classList.contains("dark")).toBe(true)
    })

    it("uses system preference (light) when no localStorage value and prefers light", async () => {
        vi.stubGlobal("window", { ...window, matchMedia: makeMatchMedia(false) })

        await act(async () => {
            render(<ThemeProvider><ThemeConsumer /></ThemeProvider>)
        })

        expect(document.documentElement.classList.contains("dark")).toBe(false)
    })

    it("toggle() writes new theme to localStorage", async () => {
        localStorageStore["dg-theme"] = "dark"
        vi.stubGlobal("window", { ...window, matchMedia: makeMatchMedia(false) })

        function TogglerTest() {
            const { toggle } = useTheme()
            return <button data-testid="toggle" onClick={toggle}>toggle</button>
        }

        await act(async () => {
            render(<ThemeProvider><TogglerTest /></ThemeProvider>)
        })

        await act(async () => {
            fireEvent.click(screen.getByTestId("toggle"))
        })

        expect(localStorageMock.setItem).toHaveBeenCalledWith("dg-theme", "light")
    })

    it("toggle() toggles dark class on documentElement", async () => {
        localStorageStore["dg-theme"] = "dark"
        vi.stubGlobal("window", { ...window, matchMedia: makeMatchMedia(false) })

        function TogglerTest() {
            const { toggle } = useTheme()
            return <button data-testid="toggle" onClick={toggle}>toggle</button>
        }

        await act(async () => {
            render(<ThemeProvider><TogglerTest /></ThemeProvider>)
        })

        const hadDark = document.documentElement.classList.contains("dark")

        await act(async () => {
            fireEvent.click(screen.getByTestId("toggle"))
        })

        expect(document.documentElement.classList.contains("dark")).toBe(!hadDark)
    })

    it("toggle() from dark to light removes dark class", async () => {
        localStorageStore["dg-theme"] = "dark"
        vi.stubGlobal("window", { ...window, matchMedia: makeMatchMedia(false) })

        function TogglerTest() {
            const { toggle } = useTheme()
            return <button data-testid="toggle" onClick={toggle}>toggle</button>
        }

        await act(async () => {
            render(<ThemeProvider><TogglerTest /></ThemeProvider>)
        })

        expect(document.documentElement.classList.contains("dark")).toBe(true)

        await act(async () => {
            fireEvent.click(screen.getByTestId("toggle"))
        })

        expect(document.documentElement.classList.contains("dark")).toBe(false)
    })

    it("toggle() from light to dark adds dark class", async () => {
        localStorageStore["dg-theme"] = "light"
        vi.stubGlobal("window", { ...window, matchMedia: makeMatchMedia(false) })

        function TogglerTest() {
            const { toggle } = useTheme()
            return <button data-testid="toggle" onClick={toggle}>toggle</button>
        }

        await act(async () => {
            render(<ThemeProvider><TogglerTest /></ThemeProvider>)
        })

        expect(document.documentElement.classList.contains("dark")).toBe(false)

        await act(async () => {
            fireEvent.click(screen.getByTestId("toggle"))
        })

        expect(document.documentElement.classList.contains("dark")).toBe(true)
    })
})

// ── ThemeToggle tests ─────────────────────────────────────────────────────────

describe("ThemeToggle", () => {
    it("renders Sun icon when theme is dark", async () => {
        localStorageStore["dg-theme"] = "dark"
        vi.stubGlobal("window", { ...window, matchMedia: makeMatchMedia(false) })

        await act(async () => {
            render(<ThemeProvider><ThemeToggle /></ThemeProvider>)
        })

        // Sun icon renders when dark
        const btn = screen.getByRole("button")
        expect(btn).toBeInTheDocument()
        // aria-label confirms dark mode
        expect(btn).toHaveAttribute("aria-label", "Switch to light mode")
    })

    it("renders Moon icon when theme is light", async () => {
        localStorageStore["dg-theme"] = "light"
        vi.stubGlobal("window", { ...window, matchMedia: makeMatchMedia(false) })

        await act(async () => {
            render(<ThemeProvider><ThemeToggle /></ThemeProvider>)
        })

        const btn = screen.getByRole("button")
        expect(btn).toHaveAttribute("aria-label", "Switch to dark mode")
    })

    it("ThemeToggle button has correct aria-label for dark mode", async () => {
        localStorageStore["dg-theme"] = "dark"
        vi.stubGlobal("window", { ...window, matchMedia: makeMatchMedia(false) })

        await act(async () => {
            render(<ThemeProvider><ThemeToggle /></ThemeProvider>)
        })

        expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Switch to light mode")
    })

    it("ThemeToggle button has correct aria-label for light mode", async () => {
        localStorageStore["dg-theme"] = "light"
        vi.stubGlobal("window", { ...window, matchMedia: makeMatchMedia(false) })

        await act(async () => {
            render(<ThemeProvider><ThemeToggle /></ThemeProvider>)
        })

        expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Switch to dark mode")
    })

    it("clicking ThemeToggle calls toggle and changes aria-label", async () => {
        localStorageStore["dg-theme"] = "dark"
        vi.stubGlobal("window", { ...window, matchMedia: makeMatchMedia(false) })

        await act(async () => {
            render(<ThemeProvider><ThemeToggle /></ThemeProvider>)
        })

        expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Switch to light mode")

        await act(async () => {
            fireEvent.click(screen.getByRole("button"))
        })

        expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Switch to dark mode")
        expect(localStorageMock.setItem).toHaveBeenCalledWith("dg-theme", "light")
    })
})
