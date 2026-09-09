const {test,expect}=require('@playwright/test');

async function open(page){
  await page.goto('/?e2e=1',{waitUntil:'domcontentloaded'});
  await page.locator('html.slh-v81-ready').waitFor({state:'attached'});
  await expect(page.locator('#smartlink-auth-gate')).toHaveClass(/hidden/);
  await page.waitForFunction(()=>typeof window.SmartLinkV81?.poll==='function'&&typeof window.SmartLinkV81?.manualSync==='function'&&typeof window.SmartLinkCloudV8?.getIntegrityStatus==='function');
  expect(await page.evaluate(()=>window.__SLH_BOOT_ERRORS__||[])).toEqual([]);
}
async function reset(page){await page.evaluate(()=>{localStorage.removeItem('slh_e2e_row_store_v81');localStorage.removeItem('slh_v81_change');localStorage.removeItem('slh_v82_change')});await page.reload({waitUntil:'domcontentloaded'});await page.locator('html.slh-v81-ready').waitFor()}

test('V8.1 keeps link persistence cloud-only across reload and removes legacy link stores',async({page})=>{
  await open(page);await reset(page);
  const out=await page.evaluate(async()=>{const db=await import('/js/db.js');await db.putOne('links',{id:'v81_reload',url:'https://example.com/v81-reload',normalizedUrl:'https://example.com/v81-reload',title:'V81 Reload',category:'Development',createdAt:Date.now(),updatedAt:Date.now()});const idb=await db.openDB();return {count:(await db.getAll('links')).length,stores:[...idb.objectStoreNames]}});
  expect(out.count).toBe(1);expect(out.stores).not.toContain('links');expect(out.stores).not.toContain('trash');expect(out.stores).not.toContain('tombstones');
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('html.slh-v81-ready').waitFor();
  expect(await page.evaluate(async()=>{const db=await import('/js/db.js');return (await db.getAll('links')).length})).toBe(1);
});

test('optimistic concurrency rejects a stale update instead of overwriting a newer cloud version',async({page})=>{
  await open(page);await reset(page);
  const result=await page.evaluate(async()=>{const cloud=await import('/js/cloud-links.js');const first=await cloud.createCloudLink({id:'v81_conflict',url:'https://example.com/conflict',normalizedUrl:'https://example.com/conflict',title:'One'});const newer=await cloud.updateCloudLink(first.id,{title:'Two'},{expectedVersion:first.version});let rejected=false,message='';try{await cloud.updateCloudLink(first.id,{title:'Stale'},{expectedVersion:first.version})}catch(e){rejected=true;message=e.message}const rows=await cloud.listCloudLinks();return {rejected,message,title:rows.find(x=>x.id===first.id)?.title,version:newer.version}});
  expect(result.rejected).toBeTruthy();expect(result.message).toContain('version_conflict');expect(result.title).toBe('Two');expect(result.version).toBeGreaterThan(1);
});

test('delete, Trash restore and individual permanent purge are server-version protected',async({page})=>{
  await open(page);await reset(page);
  const restored=await page.evaluate(async()=>{const db=await import('/js/db.js');const link=await db.putOne('links',{id:'v81_trash',url:'https://example.com/trash',normalizedUrl:'https://example.com/trash',title:'Trash'});await db.deleteOne('links',link.id);const before=(await db.getAll('trash')).length;await db.restoreTrash(link.id);return {before,live:(await db.getAll('links')).length,trash:(await db.getAll('trash')).length}});
  expect(restored).toEqual({before:1,live:1,trash:0});
  const purged=await page.evaluate(async()=>{const db=await import('/js/db.js');const link=(await db.getAll('links'))[0];await db.deleteOne('links',link.id);await db.purgeTrashItem(link.id,{confirm:'PURGE'});return {live:(await db.getAll('links')).length,trash:(await db.getAll('trash')).length}});
  expect(purged).toEqual({live:0,trash:0});
});

test('offline link save is rejected and never reported as saved',async({page,context})=>{
  await open(page);await reset(page);await context.setOffline(true);
  const result=await page.evaluate(async()=>{const db=await import('/js/db.js');try{await db.putOne('links',{id:'offline',url:'https://example.com/offline',normalizedUrl:'https://example.com/offline',title:'Offline'});return {saved:true}}catch(e){return {saved:false,message:e.message,count:(await db.getAll('links')).length}}});
  expect(result.saved).toBeFalsy();expect(result.message).toContain('Cloud connection required');expect(result.count).toBe(0);await context.setOffline(false);
});

test('two tabs receive live cloud changes through the V8.1 channel',async({page,context})=>{
  await open(page);await reset(page);const second=await context.newPage();await open(second);
  await page.evaluate(async()=>{const db=await import('/js/db.js');await db.putOne('links',{id:'v81_multitab',url:'https://example.com/multitab',normalizedUrl:'https://example.com/multitab',title:'Multi Tab'})});
  await expect.poll(()=>second.evaluate(async()=>{const db=await import('/js/db.js');return (await db.getAll('links')).some(x=>x.id==='v81_multitab')}),{timeout:8000}).toBeTruthy();
  await second.close();
});

test('manual refresh button pulls cloud data and exposes a touch-friendly sync action',async({page})=>{
  await open(page);await reset(page);
  await expect(page.locator('#v82-refresh-btn')).toBeVisible();
  await page.evaluate(async()=>{const db=await import('/js/db.js');await db.putOne('links',{id:'v82_manual',url:'https://example.com/manual-sync',normalizedUrl:'https://example.com/manual-sync',title:'Manual Sync'})});
  await page.locator('#v82-refresh-btn').click();
  await expect.poll(()=>page.evaluate(()=>document.getElementById('side-links')?.textContent),{timeout:5000}).toBe('1');
  await expect(page.locator('#v82-refresh-btn')).toHaveAttribute('aria-label',/Cloud sync complete|Refresh and sync cloud/);
});

test('integrity, import preflight and verified safety backup are available',async({page})=>{
  await open(page);await reset(page);
  const result=await page.evaluate(async()=>{const db=await import('/js/db.js');await db.bulkPut('links',[{id:'imp1',url:'https://example.com/imp1',normalizedUrl:'https://example.com/imp1',title:'Import 1'},{id:'imp2',url:'https://example.com/imp2',normalizedUrl:'https://example.com/imp2',title:'Import 2'}]);const integrity=await db.getIntegrityStatus(),backups=await db.listBackups(20),verified=backups[0]?await db.verifyBackup(backups[0].id):null,preview=await db.previewImport([{url:'https://example.com/imp1',normalizedUrl:'https://example.com/imp1'},{url:'https://example.com/new',normalizedUrl:'https://example.com/new'}]);return {integrity,backupCount:backups.length,verified,preview}});
  expect(Number(result.integrity.live_links)).toBe(2);expect(Number(result.integrity.duplicate_groups)).toBe(0);expect(result.backupCount).toBeGreaterThan(0);expect(result.verified.ok).toBeTruthy();expect(Number(result.preview.duplicate_cloud)).toBe(1);
});

test('@mobile V8.2 refresh/sync button remains visible and usable on phone layout',async({page})=>{
  await open(page);
  await expect(page.locator('#v82-refresh-btn')).toBeVisible();
  const box=await page.locator('#v82-refresh-btn').boundingBox();expect(box.width).toBeGreaterThanOrEqual(40);expect(box.height).toBeGreaterThanOrEqual(40);
  await expect(page.locator('#v7-mobile-nav')).toBeVisible();
  await page.locator('#v82-refresh-btn').click();
  await expect(page.locator('#v82-refresh-btn')).not.toHaveClass(/error/);
});
