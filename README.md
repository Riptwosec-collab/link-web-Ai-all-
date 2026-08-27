# Smart Link Hub V5.1

Local-first intelligent web library with premium motion, rich link previews, analytics, keyboard navigation and optional cloud sync.

## Included
- Persistent IndexedDB library, favorites, settings, edits, delete + undo and duplicate detection
- Real collections with drag/drop, fuzzy full-library search and related links
- Background-first link cards with logo/feature-image fallback and smart metadata repair
- Premium GPU-friendly Aurora graphics, pointer spotlight, page/card transitions and touch feedback
- Card actions simplified to **Favorite + More** with Open, Edit, Copy URL, Refresh Metadata, Move to Collection, Archive Snapshot and Delete/Undo
- Insights dashboard with animated SVG activity chart, category donut, health ring, top collections, most-opened ranking and 7D/30D/90D ranges
- JSON/CSV/Netscape HTML import/export plus ZIP backup
- Link-health center and archive snapshots
- Global Search: `Ctrl/Cmd + K`
- Command Palette: `Ctrl/Cmd + P`
- PWA install and offline cache
- Optional Cloudflare Worker: metadata, Workers AI tags/summary, health checks and HTML snapshot excerpts
- Optional Supabase auth/sync schema with RLS and workspace roles

## Navigation
Main: **Home · Library · Collections · Favorites**

Insights: **Analytics · Link Health**

More: **Workspaces / Advanced**

Settings: **General · Data / Import / Export**

Archive is available as a Library sub-view rather than a top-level sidebar item.

## Static app
Serve the repository root with GitHub Pages, Cloudflare Pages, Vercel or any static host. `index.html` is the direct entry point.

## Performance
V5.1 uses a lean performance layer with `content-visibility`, CSS containment, lazy images and motion based mainly on `transform`, `opacity`, and SVG stroke animation. Legacy V3/V5 logo-cover performance rules are no longer loaded.

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
