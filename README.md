# Smart Link Hub V3

Local-first intelligent web library. The app works without a backend using IndexedDB, and can optionally connect to a Cloudflare Worker and Supabase for richer metadata/AI/health/snapshot services and cross-device sync.

## Included
- Persistent IndexedDB library, favorites, settings, edits, delete + 8s undo and duplicate detection
- Real collections with drag/drop, fuzzy full-library search and related links
- JSON/CSV/Netscape HTML import/export plus ZIP backup
- Real local analytics, link-health center and archive snapshots
- Command palette (`Ctrl/Cmd + K`), PWA install and offline cache
- Optional Cloudflare Worker: metadata, Workers AI tags/summary, health checks and HTML snapshot excerpts
- Optional Supabase auth/sync schema with RLS and workspace roles

## Static app
Serve the repository root with GitHub Pages, Cloudflare Pages, Vercel or any static host. `index.html` is the direct entry point; the old runtime source-part assembly is no longer needed.

## Cloudflare Worker (optional)
```bash
cd worker
npx wrangler deploy
```
Then paste the resulting Worker URL into **Settings → Cloudflare Worker**. The Worker uses the `AI` binding configured in `wrangler.toml`; if AI is unavailable, it returns a deterministic categorization fallback.

## Supabase sync (optional)
1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Enable Email/Password authentication.
4. In Smart Link Hub Settings, enter the project URL and **public anon key** (never a service-role key).
5. Sign up / sign in, then use Pull / Push in Workspaces.

Cloud rows store user-owned app objects as JSONB; RLS isolates each user's library. Workspace membership tables include owner/editor/viewer roles for future shared-collection expansion.
