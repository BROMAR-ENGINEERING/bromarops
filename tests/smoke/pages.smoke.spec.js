// Smoke test: load every page with a stubbed Supabase client + sample data,
// fail on any console error / uncaught exception, screenshot at 380px and desktop.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const tables = fs.readFileSync(path.join(__dirname, '../fixtures/tables.json'), 'utf8');
const stubBody = fs.readFileSync(path.join(__dirname, 'supabase-stub.js'), 'utf8');
const STUB = `${stubBody}(${tables}, 'admin@example.com');`;

// Keep in sync with NAV_ITEMS in js/core.js (+ hidden #_components page).
const PAGES = ['dashboard', 'jobs', 'quotes', 'scheduling', 'timesheets', 'employees', 'ims', 'fleet',
  'equipment', 'clients', 'tasks', 'materials', 'admin', '_components'];

const VIEWPORTS = [
  { name: 'mobile-380', width: 380, height: 800 },
  { name: 'desktop', width: 1440, height: 900 }
];

// Third-party noise we don't control.
const IGNORED = [/favicon/i];

async function setup(page, errors) {
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url) || url.startsWith('data:')) return route.continue();
    if (/@supabase\/supabase-js/.test(url)) {
      return route.fulfill({ contentType: 'application/javascript', body: STUB });
    }
    if (/open-meteo|weather/i.test(url)) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        current: { temperature_2m: 20, weather_code: 1 }, current_weather: { temperature: 20, weathercode: 1 },
        daily: { time: [], temperature_2m_max: [], temperature_2m_min: [], weathercode: [] } }) });
    }
    // Libraries (jsPDF, SheetJS, pdf.js) and fonts come from the real CDN.
    return route.continue();
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (IGNORED.some((re) => re.test(t))) return;
    errors.push('console.error: ' + t);
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
}

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const id of PAGES) {
      test(`page #${id}`, async ({ page }, testInfo) => {
        const errors = [];
        await setup(page, errors);
        await page.goto('/index.html#' + id);
        await page.waitForSelector('#app *', { timeout: 20000 });
        await page.waitForTimeout(1500); // let async renders settle
        const text = await page.locator('#app').innerText();
        expect(text, 'page rendered (not blank / not auth error card)').not.toMatch(/Can't reach server/);
        expect(text.length).toBeGreaterThan(50);
        const shot = await page.screenshot({ fullPage: true });
        await testInfo.attach(`${id}-${vp.name}`, { body: shot, contentType: 'image/png' });
        expect(errors, errors.join('\n')).toEqual([]);
      });
    }

    test('standalone thermalimaging.html', async ({ page }, testInfo) => {
      const errors = [];
      await setup(page, errors);
      await page.goto('/thermalimaging.html');
      await page.waitForTimeout(1000);
      await testInfo.attach(`thermalimaging-${vp.name}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      expect(errors, errors.join('\n')).toEqual([]);
    });
  });
}
