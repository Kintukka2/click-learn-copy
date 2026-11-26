# Steplight: notes for Claude

## Marketing and messaging rules

These apply to every video, deck, page, post or pitch made about Steplight.

- Never say or show that the server runs on the founder's own PC or any personal machine. Say Steplight runs on **a dedicated server** ("a single container on a dedicated server"). Running it on a PC is a temporary setup, not part of the product story.
- Keep hosting details out: no domains, tunnel or origin hostnames, reverse-proxy setup, `localhost` URLs or GitHub account names (they appear in `docs/DEPLOY.md`, `docs/WEB-STORE.md`, `docs/ROADMAP.md` and the git log). On screen, show the demo app as `erp.northwind.example` and the portal as `learn.northwind.example`.
- Don't call Steplight open source, and don't state its pricing or customer numbers. None of these are settled.
- Plans change: describe architecture and the roadmap accurately at a high level, without promising dates or exact designs.
- No real people on screen or in copy. The research in `research/` names the competitor's staff and testimonial authors; leave them out. The demo data's contact names, phone numbers and e-mail domains are replaced in any capture (see `brag-output/README.md`).
- Name ClickLearn only in investor material, never in client-facing ads. Client copy says "legacy desktop tools".
- Keep "the problem" high level ("Every software release breaks the training", "release after release"). Don't back it with niche examples such as named platforms, their release waves or release dates.
- Every claim must be traceable to the code, the docs, the tests or `research/`. Market figures are labelled as third-party numbers.

## Extension version

Every change that ships in the browser extension bumps `version` in `extension/manifest.json`, in the same pull request as the change, so the version Chrome shows tells which build is loaded.

- The extension is built from `extension/` and the code it bundles from `src/`: `src/capture`, `src/assist`, `src/core` and `src/players`. A change to any of them counts.
- New features (one or several in one pull request) bump the minor version: 0.9.0 → 0.10.0. Fixes only bump the patch: 0.9.0 → 0.9.1.
- Studio-only and server-only changes (`studio/`, `src/server`, `src/generators`, `src/portal`) leave the version alone.
- Mention the new version in the pull request description.
