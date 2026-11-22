import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
export async function start(app, url) {
  const dir = new URL(`./shots/${app}/`, import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const page = await ctx.newPage();
  const log = [];
  let step = 0;
  page.on('console', (m) => { if (m.type() !== 'debug') log.push(`[step ${step}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => log.push(`[step ${step}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => log.push(`[step ${step}] requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('dialog', (d) => { log.push(`[step ${step}] dialog: ${d.message()}`); d.dismiss(); });

  const lines = [];
  async function shot(name, note = '') {
    step++;
    const file = `${dir}${String(step).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: file, fullPage: true });
    const aria = await page.locator('body').ariaSnapshot();
    writeFileSync(file.replace('.png', '.aria.yml'), aria);
    lines.push(`${step} ${name}: ${note}`);
    console.log(`--- ${step} ${name} ${note}`); if (process.env.ARIA) console.log(aria);
  }
  async function done() {
    console.log('=== console log\n' + log.join('\n'));
    writeFileSync(`${dir}console.log`, log.join('\n'));
    await browser.close();
  }
  return { page, shot, done, log };
}
