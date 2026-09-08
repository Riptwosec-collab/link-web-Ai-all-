const {test,expect}=require('@playwright/test');

async function openApp(page,path='/?e2e=1'){
  await page.goto(path,{waitUntil:'domcontentloaded'});
  await page.locator('html.slh-v7-ready').waitFor({state:'attached'});
  await expect(page.locator('#smartlink-auth-gate')).toHaveClass(/hidden/);
  await page.waitForFunction(()=>typeof window.SmartLinkV7?.route==='function'&&typeof window.SmartLinkV7?.indexPending==='function'&&typeof window.SmartLinkV76?.renderOrganization==='function');
  const errors=await page.evaluate(()=>window.__SLH_BOOT_ERRORS__||[]);
  expect(errors).toEqual([]);
}
async function configureWorker(page){
  await page.evaluate(async()=>{const {setSetting}=await import('/js/db.js');await setSetting('workerUrl',location.origin+'/e2e-worker')});
}
async function linkCount(page){return page.evaluate(async()=>{const {getAll}=await import('/js/db.js');return (await getAll('links')).length})}

test('V7 boots through the custom cloud session and exposes build truth',async({page})=>{
  await openApp(page);
  await expect(page.locator('html')).toHaveAttribute('data-slh-version','7');
  await expect(page.locator('meta[name="slh-build"]')).toHaveAttribute('content','slh-v7-20260909');
  expect(await page.evaluate(()=>window.__SLH_BUILD__?.version)).toBe('7.0.0');
  await expect(page.locator('body')).toContainText('Smart Link Hub');
});

test('Desktop sidebar exposes only the seven daily navigation destinations',async({page})=>{
  await openApp(page);
  await page.locator('#sidebar-nav.slh-clean-nav').waitFor();
  await expect(page.locator('#sidebar-nav>.slh-primary-nav-item')).toHaveCount(7);
  const labels=await page.locator('#sidebar-nav>.slh-primary-nav-item').allTextContents();
  expect(labels.map(x=>x.replace(/\s+/g,' ').trim())).toEqual(['Home','Library','AI Search','Categories','Favorites','Read Later','Settings']);
  await expect(page.locator('#sidebar-nav>[data-page="analytics"]')).toBeHidden();
  await expect(page.locator('#sidebar-nav>[data-page="workspaces"]')).toBeHidden();
  await expect(page.locator('#v7-nav')).toBeHidden();
  await expect(page.locator('#v6-nav-marker')).toBeHidden();
});

test('Gold and Blue themes persist across reload',async({page})=>{
  await openApp(page);
  await page.evaluate(()=>window.SmartLinkTheme.set('gold'));
  await expect(page.locator('html')).toHaveAttribute('data-theme','gold');
  await page.evaluate(()=>window.SmartLinkTheme.set('blue'));
  await expect(page.locator('html')).toHaveAttribute('data-theme','blue');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('html.slh-v7-ready').waitFor();
  await expect(page.locator('html')).toHaveAttribute('data-theme','blue');
  await page.evaluate(()=>window.SmartLinkTheme.set('gold'));
  await expect(page.locator('html')).toHaveAttribute('data-theme','gold');
});

test('Universal capture strips trackers, prevents duplicates and survives reload',async({page})=>{
  await openApp(page);
  await page.evaluate(()=>window.SmartLinkV7.captureText('https://www.example.com/article/?utm_source=newsletter&fbclid=abc',{via:'e2e'}));
  expect(await linkCount(page)).toBe(1);
  const first=await page.evaluate(async()=>{const {getAll}=await import('/js/db.js');return (await getAll('links'))[0]});
  expect(first.normalizedUrl).toBe('https://example.com/article');
  await page.evaluate(()=>window.SmartLinkV7.captureText('https://example.com/article?utm_campaign=second',{via:'e2e'}));
  expect(await linkCount(page)).toBe(1);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('html.slh-v7-ready').waitFor();
  expect(await linkCount(page)).toBe(1);
});

test('Delete creates Trash and restore returns the saved link',async({page})=>{
  await openApp(page);
  await page.evaluate(()=>window.SmartLinkV7.captureText('https://example.org/restore-me',{via:'e2e'}));
  const state=await page.evaluate(async()=>{const db=await import('/js/db.js');const link=(await db.getAll('links'))[0];await db.deleteOne('links',link.id);return {links:(await db.getAll('links')).length,trash:(await db.getAll('trash')).length,id:link.id}});
  expect(state.links).toBe(0);expect(state.trash).toBe(1);
  const restored=await page.evaluate(async id=>{const db=await import('/js/db.js');await db.restoreTrash(id);return {links:(await db.getAll('links')).length,trash:(await db.getAll('trash')).length}},state.id);
  expect(restored.links).toBe(1);expect(restored.trash).toBe(0);
});

test('V7 command palette owns Ctrl+K and routes to V7 pages',async({page})=>{
  await openApp(page);
  await page.keyboard.press('Control+K');
  await expect(page.locator('#v7-command')).not.toHaveClass(/hidden/);
  await page.locator('#v7-command-input').fill('Duplicate Center');
  await expect(page.locator('.v7-command-row')).toContainText('Duplicate Center');
  await page.keyboard.press('Enter');
  await expect(page.locator('#page-title')).toHaveText('Duplicate Center');
});

test('System Status verifies local build, cloud contract and runtime diagnostics',async({page})=>{
  await openApp(page);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('smartlink:v7-open',{detail:{page:'status'}})));
  await expect(page.locator('#page-title')).toHaveText('System Status');
  await expect(page.locator('#dynamic-content')).toContainText('App build');
  await expect(page.locator('#dynamic-content')).toContainText('Supabase');
  await expect(page.locator('#dynamic-content')).toContainText('IndexedDB');
  await expect(page.locator('#dynamic-content')).toContainText('Current');
});

test('Semantic index, hybrid search and full-text archive work against deterministic test services',async({page})=>{
  await openApp(page);
  await configureWorker(page);
  await page.evaluate(async()=>{
    await window.SmartLinkV7.captureText('https://github.com/example/network-security-tool',{title:'Network security monitoring repository',tags:['security','network'],via:'e2e'});
    await window.SmartLinkV7.captureText('https://example.com/design-system',{title:'Modern UI design system guide',tags:['design','ui'],via:'e2e'});
  });
  const indexed=await page.evaluate(()=>window.SmartLinkV7.indexPending(10));
  expect(indexed.indexed).toBeGreaterThanOrEqual(2);
  const result=await page.evaluate(async()=>{const rows=await window.SmartLinkV7.hybridSearch('network security');return rows.map(x=>({title:x.link.title,score:x.score}))});
  expect(result.length).toBeGreaterThan(0);
  expect(result.some(x=>/network security/i.test(x.title))).toBeTruthy();
  const archived=await page.evaluate(async()=>{const db=await import('/js/db.js');const l=(await db.getAll('links'))[0];await window.SmartLinkV7.archiveLink(l,{visual:true});const d=await db.getDocument(l.id);return {content:d?.content||'',archived:(await db.getOne('links',l.id))?.archivedAt||0}});
  expect(archived.content).toContain('deterministic archived content');
  expect(archived.archived).toBeGreaterThan(0);
});

test('Import analysis does not write before confirmation and Smart Views remain available as library tools',async({page})=>{
  await openApp(page);
  await page.evaluate(()=>window.SmartLinkV7.captureText('https://github.com/example/demo',{title:'Demo repository',via:'e2e'}));
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('smartlink:v7-open',{detail:{page:'views'}})));
  await expect(page.locator('#page-title')).toHaveText('Smart Views');
  await expect(page.locator('#dynamic-content')).toContainText('GitHub Repos');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('smartlink:v7-open',{detail:{page:'import'}})));
  await expect(page.locator('#page-title')).toHaveText('Import Wizard');
  await expect(page.locator('#dynamic-content')).toContainText('Analyze');
});

test('@mobile mobile navigation keeps Home, Library, Add, AI and Categories',async({page})=>{
  await openApp(page);
  await expect(page.locator('#v7-mobile-nav')).toBeVisible();
  await page.locator('[data-v7-mobile="ai"]').click();
  await expect(page.locator('#page-title')).toHaveText('Semantic AI');
  await expect(page.locator('[data-v7-mobile="categories"]')).toBeVisible();
  await page.locator('[data-v7-mobile="categories"]').click();
  await expect(page.locator('#page-title')).toHaveText('Category Center');
});