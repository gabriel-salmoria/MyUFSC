import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

// eslint-config-next 16.x ships native flat-config arrays. `core-web-vitals`
// already spreads the base config (which includes `next/typescript`'s
// TypeScript rules via typescript-eslint), so it is the single baseline preset
// — no FlatCompat shim needed.
const eslintConfig = [
  {
    // Generated, vendored, or non-JS/TS trees that are not this repo's source
    // to lint. `components/ui/**` is shadcn-generated (see CLAUDE.md — do not
    // hand-edit); `scrapers/**` is Rust; the rest are build/data artifacts.
    ignores: [
      ".next/**",
      "node_modules/**",
      "scrapers/**",
      ".dev-db/**",
      "data/**",
      "curriculums/**",
      "components/ui/**",
    ],
  },
  ...nextCoreWebVitals,
];

export default eslintConfig;
