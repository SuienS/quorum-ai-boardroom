# Notes for coding agents and contributors

Read the README first; this file lists the rules that are easy to break.

- **Secrets stay on the server.** Provider keys are read from `process.env` only in
  `src/lib/council-models.server.ts`. Never add a `VITE_`-prefixed secret, never read keys in
  route files or `*.functions.ts` at module level (they ship to the client), and never return keys,
  base URLs or raw provider errors to the browser — use `toPublicConfig` and `describeProviderError`.
- **Model output is untrusted.** Every AI response goes through `normalizeBoardResult`
  (`src/lib/council.ts`), which clamps numbers, whitelists enums and filters seats. Seat
  provider/model/fallback labels come from the server's own plan, never from model output.
- **Provider layer.** `src/lib/council-models.server.ts` calls each provider over plain `fetch`
  (OpenAI-compatible Chat Completions, Anthropic Messages, Gemini's OpenAI-compatible endpoint) so it
  runs on Node.js and Workers alike. Single-provider boards make one strict-schema call; mixed boards
  make one call per seat plus a synthesis call on the default provider, with per-seat fallback.
- **Attachments are parsed in the browser.** `src/lib/attachments.ts` loads pdf.js/mammoth
  dynamically inside event handlers; only bounded, schema-validated text reaches the server, and it
  is labelled as untrusted evidence in the prompt.
- **Generated files.** Don't hand-edit `src/routeTree.gen.ts`; TanStack Router regenerates it.
- **Routing.** File-based routes live in `src/routes/` (`__root.tsx` is the shell; keep its
  `<Outlet />`). Don't create Next.js/Remix-style `pages/` or `app/` directories.
- **Server build.** Don't set `ssr.external`/`resolve.external` in `vite.config.ts` (Worker targets
  have no runtime module resolution) and don't compress responses in app code.
- **Before opening a PR:** `npm run typecheck && npm run lint && npm test && npm run build`.
