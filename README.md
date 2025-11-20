# SiteScanner AI PoC

This repository contains a mono-repo proof of concept for an automated web issue scanner, approval portal, and Codex-powered fixer workflow.

## Structure

- `backend/` – Node-based scanner and worker services plus shared Docker image.
- `portal/` – Next.js portal for reviewing, approving, and creating issues.
- `supabase/` – SQL required to provision database objects, triggers, RPCs, and RLS policies.
- `site-repo/` – Placeholder mount point for the target website repository that Codex will scan and edit (e.g., SSW.Rules.Content).
- `docker-compose.yml` – Runs the scanner and worker containers locally.
- `example.env` – Environment variable reference used by both services and portal.

## 1. Supabase Setup

1. Create a Supabase project and note `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
2. In the SQL editor, run everything in `supabase/schema.sql`. The bundled RLS policies temporarily allow both `authenticated` and `anon` roles so the unauthenticated portal can work; tighten them once you add Supabase Auth.
3. (Optional) Enable authentication providers you need for the portal.

## 2. Portal

```bash
cd portal
cp ../example.env .env.local # edit ONLY the NEXT_PUBLIC_* variables here
npm install
npm run dev
```

Visit `http://localhost:3000/issues` to view the issue board and `/issues/new` to file manual issues. Authentication is not wired yet, so rely on Supabase row-level security for now.

## 3. Preparing the Target Repository (site-repo)

The scanner needs a local clone of the website repository to scan. For **SSW.Rules.Content**, do:

```bash
cd site-repo
git clone https://github.com/sswConsulting/SSW.Rules.Content.git .
```

Alternatively, Docker will auto-clone it for you if you set `TARGET_REPO_URL` in your `.env` file (see next section).

## 4. Backend Services

1. Populate `.env` from `example.env` and set the server-only values:
   - `SUPABASE_*` keys from your Supabase project
   - `OPENAI_API_KEY` (valid for Codex - you can also use `codex login --token` inside the container)
   - `SITE_URL` (e.g., `https://www.ssw.com.au/rules`)
   - `GITHUB_TOKEN` (personal access token with repo permissions)
   - `TARGET_REPO_URL` (e.g., `https://github.com/sswConsulting/SSW.Rules.Content.git`)
   - Optional: `RULE_FOCUS` (comma-separated repo-relative Markdown paths to scan specific rules only)

2. Run `docker compose up --build`. On startup, the worker container's entrypoint will:
   - Clone `TARGET_REPO_URL` into `site-repo/` if not already present (injecting `GITHUB_TOKEN` for authentication)
   - Reset the remote URL to remove embedded credentials
   - Pull the latest `BASE_BRANCH` on each restart

3. The scanner reads Markdown files from `site-repo/` (mounted as `/repo` in containers) and uses Codex to identify stale guidance. The portal lets you review and approve issues. The worker polls for approved issues, attempts fixes using Codex CLI, pushes a branch, creates a PR via `gh`, and updates Supabase with the PR URL.

## 5. Next Steps

- Tune the scanner prompt inside `backend/scanner.js` (e.g., change `RULE_FOCUS`, add new heuristics, or layer additional Codex passes for accessibility/compliance).
- Add Supabase Auth to the portal and wrap the RPCs with API routes if needed.
- Teach the worker to run tests, retry failures, and mark issues as `done` after PR merge.
- Explore scanning for accessibility issues, broken links, or compliance violations.