import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: false, // serial — shared DB state
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: process.env.CI
        ? [["html", { outputFolder: "playwright-report", open: "never" }], ["list"]]
        : [["list"]],
    use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3003",
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        video: "off",
    },
    projects: [
        // Global setup: seed auth state for each role
        {
            name: "setup",
            testMatch: /fixtures\/setup\.ts/,
        },
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
            testMatch: /tests\/.+\.spec\.ts/,
            dependencies: ["setup"],
        },
    ],
    // Dev server is started externally (npm run dev or docker-compose)
})
