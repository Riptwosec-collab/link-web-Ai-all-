const {test,expect}=require('@playwright/test');

async function openApp(page,path='/?e2e=1'){
  await page.goto(path,{waitUntil:'domcontentloaded'});
  await page.locator('html.slh-v7-ready').waitFor({state:'attached'});
  await expect(page.locator('#smartlink-auth-gate')).toHaveClass(/hidden/);
}
async function firstLink(page){return page.evaluate(async()=>{const db=await import('/js/db.js');return (await db.getAll('links'))[0]})}

test('V7.6 auto category organizes GitHub and removes General tag',async({page})=>{
  await openApp(page);
  await page.evaluate(()=>window.SmartLinkV7.captureText('https://github.com/example/next-dashboard',{title:'Next.js React dashboard repository',via:'e2e-v76'}));
  await expect.poll(async()=>{const l=await firstLink(page);return l?.category}).toBe('Development');
  const link=await firstLink(page);
  expect(link.tags.map(x=>String(x).toLowerCase())).not.toContain('general');
  expect(link.organizeState).toBe('ready');
  expect(link.tags).toContain('GitHub');
});

test('Personal domain rule is remembered and wins for future links',async({page})=>{
  await openApp(page);
  await page.evaluate(()=>window.SmartLinkV76.saveRule('youtube.com','Education'));
  await page.evaluate(()=>window.SmartLinkV7.captureText('https://youtube.com/watch?v=abcdef',{title:'CCNA networking tutorial',via:'e2e-v76'}));
  await expect.poll(async()=>{const l=await firstLink(page);return l?.category}).toBe('Education');
  const link=await firstLink(page);
  expect(link.categorySource).toBe('personal-rule-v1');
  expect(link.subcategory).toBe('Networking');
});

test('Category Center exposes smart collections and taxonomy controls',async({page})=>{
  await openApp(page);
  await page.evaluate(()=>window.SmartLinkV7.captureText('https://github.com/example/security',{title:'Security repository',via:'e2e-v76'}));
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('smartlink:v76-open',{detail:{page:'organization'}})));
  await expect(page.locator('#page-title')).toHaveText('Category Center');
  await expect(page.locator('#dynamic-content')).toContainText('Smart Collections');
  await expect(page.locator('#dynamic-content')).toContainText('Personal rules');
  await expect(page.locator('[data-v76-reorg]')).toBeVisible();
  await expect(page.locator('[data-v76-normalize]')).toBeVisible();
});

test('Link Detail Drawer shows organization, tags and related links area',async({page})=>{
  await openApp(page);
  await page.evaluate(()=>window.SmartLinkV7.captureText('https://github.com/example/tool',{title:'Developer tool repository',tags:['javascript'],via:'e2e-v76'}));
  const link=await firstLink(page);
  await page.evaluate(id=>window.SmartLinkV76.openDrawer(id),link.id);
  await expect(page.locator('#v76-drawer')).not.toHaveClass(/hidden/);
  await expect(page.locator('#v76-drawer')).toContainText('Organization');
  await expect(page.locator('#v76-drawer')).toContainText('Tags');
  await expect(page.locator('#v76-drawer')).toContainText('Related links');
});

test('Library search upgrades to grouped results with categories and tags',async({page})=>{
  await openApp(page);
  await page.evaluate(()=>window.SmartLinkV7.captureText('https://github.com/example/react-app',{title:'React application repository',tags:['React'],via:'e2e-v76'}));
  await page.locator('[data-page="search"]').click();
  await page.locator('#search-input').fill('React');
  await expect(page.locator('.v76-search-groups')).toBeVisible();
  await expect(page.locator('.v76-search-groups')).toContainText('Best matches');
  await expect(page.locator('.v76-search-groups')).toContainText('Categories');
  await expect(page.locator('.v76-search-groups')).toContainText('Tags');
});
