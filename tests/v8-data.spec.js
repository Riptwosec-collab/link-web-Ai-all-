const {test,expect}=require('@playwright/test');

async function openApp(page){
  await page.goto('/?e2e=1',{waitUntil:'domcontentloaded'});
  await page.locator('html.slh-v7-ready').waitFor({state:'attached'});
  await expect(page.locator('#smartlink-auth-gate')).toHaveClass(/hidden/);
  await page.waitForFunction(()=>typeof window.SmartLinkCloudV8?.listCloudLinks==='function'&&typeof window.SmartLinkDataV8?.open==='function');
}

test('V8 persists links through the cloud API but creates no IndexedDB link stores',async({page})=>{
  await openApp(page);
  await page.evaluate(()=>window.SmartLinkV7.captureText('https://example.com/cloud-only?utm_source=test',{title:'Cloud only',via:'v8-e2e'}));
  expect(await page.evaluate(async()=>{const db=await import('/js/db.js');return (await db.getAll('links')).length})).toBe(1);
  const stores=await page.evaluate(async()=>{const db=await import('/js/db.js');const handle=await db.openDB();return [...handle.objectStoreNames]});
  expect(stores).not.toContain('links');
  expect(stores).not.toContain('trash');
  expect(stores).not.toContain('tombstones');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('html.slh-v7-ready').waitFor();
  expect(await page.evaluate(async()=>{const db=await import('/js/db.js');return (await db.getAll('links')).length})).toBe(1);
});

test('V8 records create delete and restore history in the cloud row store',async({page})=>{
  await openApp(page);
  const id=await page.evaluate(async()=>{await window.SmartLinkV7.captureText('https://example.org/history',{title:'History test',via:'v8-e2e'});const db=await import('/js/db.js');return (await db.getAll('links'))[0].id});
  await page.evaluate(async id=>{const db=await import('/js/db.js');await db.deleteOne('links',id)},id);
  let actions=await page.evaluate(async id=>{const db=await import('/js/db.js');return (await db.getLinkHistory(id,20)).map(x=>x.action)},id);
  expect(actions).toContain('create');
  expect(actions).toContain('delete');
  await page.evaluate(async id=>{const db=await import('/js/db.js');await db.restoreTrash(id)},id);
  actions=await page.evaluate(async id=>{const db=await import('/js/db.js');return (await db.getLinkHistory(id,20)).map(x=>x.action)},id);
  expect(actions).toContain('restore');
  expect(await page.evaluate(async()=>{const db=await import('/js/db.js');return (await db.getAll('links')).length})).toBe(1);
});

test('V8 manual backup supports preview and safe restore',async({page})=>{
  await openApp(page);
  const result=await page.evaluate(async()=>{
    await window.SmartLinkV7.captureText('https://example.net/backup-a',{title:'Backup A',via:'v8-e2e'});
    const db=await import('/js/db.js');
    const backup=await db.createBackup('e2e-manual');
    await window.SmartLinkV7.captureText('https://example.net/backup-b',{title:'Backup B',via:'v8-e2e'});
    const preview=await db.previewBackup(backup.id);
    await db.restoreBackup(backup.id,{confirm:true});
    return {preview,links:(await db.getAll('links')).map(x=>x.normalizedUrl)};
  });
  expect(Number(result.preview.current_links)).toBe(2);
  expect(Number(result.preview.backup_links)).toBe(1);
  expect(Number(result.preview.will_remove)).toBe(1);
  expect(result.links).toHaveLength(1);
  expect(result.links[0]).toContain('backup-a');
});

test('Cloud & Backup tool opens the V8 Data Center instead of legacy sync controls',async({page})=>{
  await openApp(page);
  await page.locator('#sidebar-nav>[data-slh-route="settings"]').click();
  await expect(page.locator('#page-title')).toHaveText('Settings');
  await page.locator('[data-tool="cloud"]').click();
  await expect(page.locator('.slh-v8-panel')).toBeVisible();
  await expect(page.locator('.slh-v8-panel')).toContainText('Cloud & Data Center');
  await expect(page.locator('.slh-v8-panel')).toContainText('Supabase is the only persistent link store');
  await expect(page.locator('.slh-v8-panel')).toContainText('Backups & Restore');
  await expect(page.locator('.slh-v8-panel')).toContainText('Version History');
});
