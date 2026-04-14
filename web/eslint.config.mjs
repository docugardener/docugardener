import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // `any` is used intentionally throughout API routes and test mocks.
      // Enforce type safety at the boundaries that matter rather than banning any globally.
      "@typescript-eslint/no-explicit-any": "warn",
      // @ts-ignore / @ts-expect-error are used in a few places where NextAuth's
      // type system doesn't cover our extended User shape — acceptable for now.
      "@typescript-eslint/ban-ts-comment": "warn",
      // Unescaped entities (apostrophes in JSX) — warn to encourage fixing over time.
      "react/no-unescaped-entities": "warn",
    },
  },
]);

export default eslintConfig;
