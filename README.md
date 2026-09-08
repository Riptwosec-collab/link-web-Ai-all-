# Smart Link Hub V6

A resilient, local-first AI web library for saving, organizing, searching and recovering links across devices. Every mutation is committed to IndexedDB first and then synchronized automatically to Supabase with conflict detection and version history.

## V6 core guarantees

- **Auto Save first** — add, edit, favorite, tag, move, archive, settings and delete mutations persist locally immediately.
- **Automatic Cloud Sync** — no manual Push/Pull workflow. Offline changes queue and retry when connectivity returns.
- **Conflict-safe revisions** — cloud writes include an expected revision; concurrent-device conflicts reload, merge and retry instead of blindly overwriting another device.
- **Trash + tombstones** — deleted links are recoverable for 30 days and deletion markers prevent stale devices from resurrecting deleted data.
- **Cloud version history** — up to 50 previous cloud states are retained per profile and can be restored from Cloud & Backup Center.
- **Portable backups** — V6 JSON backup contains links, collections, settings, archives, workspaces, Trash/tombstones and events; V6 import merges the state and queues a cloud sync.

## Productivity

- Home library intelligence with broken/unknown, uncategorized, Trash, Read Later and queued-sync signals.
- Rich link cards with Favorite, Edit, Read Later and multi-select controls.
- **Bulk actions:** favorite, Read Later, move collection, add tags, AI organize, Archive Snapshot, export and move to Trash.
- **Read Later workflow:** Unread → Reading → Completed with progress and last-opened tracking.
- Collections, drag/drop and **nested collections** using `parentId` without breaking existing collection IDs.
- Workspaces remain compatible with existing project/collection groupings.
- Link Health Center, snapshots/archive, Favorites and analytics.
- Extended analytics with top domains and stale-link lifecycle signals.
- Duplicate prevention on capture/import by normalized URL.

## AI

Cloudflare Worker V6 exposes:

- `GET /api/metadata` — preview metadata.
- `GET /api/health` — link availability.
- `GET /api/snapshot` — bounded HTML/text snapshot.
- `POST /api/ai` — classify one link.
- `POST /api/ai-batch` — organize up to 80 links in bounded batches.
- `POST /api/ask` — **Ask My Links**, grounded only in supplied saved-link context.

The Worker uses the configured Workers AI binding and has deterministic local/classification fallbacks. URL-fetch endpoints reject localhost, private/link-local IP ranges, internal hostnames, credentials in URLs and unsafe redirect targets, with response-size and timeout limits.

## Search & command palette

Press `Ctrl/Cmd + K` to search across:

- title
- URL/domain
- description/summary
- tags
- category
- collection name

The V6 command palette also opens Home, Library, Favorites, Collections, Read Later, AI Search, Health, Archive, Trash, Cloud & Backup, Import/Export and Settings, and can trigger cloud sync, JSON backup and random-link actions.

## Cloud login & security

The current private profile selector includes **Mek (`mek`)**. V6 login records a human-readable device name and keeps the existing 6-digit PIN + lockout model.

Cloud & Backup Center includes:

- current local/cloud counts
- pending mutation queue
- cloud revision history
- restore previous revision
- active device sessions
- logout one device
- logout all other sessions
- login audit history
- Lock now / configurable inactivity auto-lock

The browser uses a publishable Supabase key only. Profile/session/state tables remain RLS-enabled; the app accesses private data through narrow SECURITY DEFINER RPCs that validate the high-entropy custom session token. Direct anonymous table access is not part of the Smart Link Hub data path.

## IndexedDB V6

Database name remains `smart-link-hub-v3` so existing user data upgrades in place. Schema version 2 adds:

- `trash`
- `tombstones`
- `syncQueue`

Existing stores remain:

- `links`
- `collections`
- `settings`
- `events`
- `archives`
- `workspaces`

## PWA

`manifest.webmanifest` includes:

- standalone installation
- Add Link / Read Later / AI Search / Cloud shortcuts
- Web Share Target (`Share → Smart Link Hub` where supported)
- app launch handling

The service worker uses network-first delivery for JS/CSS/manifest assets, V6 offline cache, Background Sync messaging and notification-click routing. App badge state is updated when supported.

## Chrome / Edge extension

The unpacked Manifest V3 extension is in `extension/`.

To install locally:

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the repository's `extension` folder.
5. Open any normal HTTP/HTTPS page and click **Smart Link Hub V6 Capture**.
6. Choose optional **Add to Read Later**, then **Save tab**.

The extension opens the production Smart Link Hub capture URL. The app deduplicates and Auto Saves locally; cloud sync proceeds after the current `Mek` session is available.

## Cloudflare Worker deployment

```bash
cd worker
npx wrangler deploy
```

`worker/wrangler.toml` already declares the Workers AI binding:

```toml
[ai]
binding = "AI"
```

After deployment, set the Worker endpoint in Smart Link Hub Settings. AI features fall back safely if the Worker or AI binding is unavailable.

## Supabase

The production application uses the custom Smart Link Hub RPC/session architecture already installed in the connected Supabase project, including:

- `smartlink_login_v2`
- `smartlink_state_get`
- `smartlink_state_put_v2`
- `smartlink_state_versions`
- `smartlink_state_restore`
- `smartlink_devices`
- `smartlink_device_logout`
- `smartlink_logout_others`
- `smartlink_login_history`

`supabase/schema.sql` in the repository is a **legacy normalized-auth schema** from the older optional integration and is not the source of truth for the current production V6 custom login/cloud path.

## Verification

`.github/workflows/v6-verify.yml` validates on pushes/PRs:

- JavaScript syntax for V6 data, sync, auth, UI, Worker and extension files
- JSON parsing for PWA and extension manifests
- required V6 assets
- Trash/Tombstone/Sync Queue contracts
- conflict-safe RPC usage
- AI endpoints and URL-fetch hardening
- PWA Share Target and shortcuts

## Hosting

The static app can run on Cloudflare, GitHub Pages, Vercel or another static host. The configured repository homepage is:

`https://link-web-ai-all.aidsaras.workers.dev/`

Production Cloudflare deployment is separate from the GitHub commit itself; verify the host is serving the latest `main` commit after deployment.
