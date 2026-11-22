import { start } from './lib.mjs';
import { readFileSync } from 'node:fs';
const PASS = 'violet otter juggles ninety lanterns';
const KEY = 'sk-ant-api03-FAKEFAKEFAKE-wxyz';
const { page, shot, done, log } = await start('knockknock');
page.setDefaultTimeout(8000);
await page.addInitScript(() => {
  window.__keyLog = []; window.__buttons = new Set(); window.__alerts = [];
  const t0 = performance.now();
  new MutationObserver(() => {
    const el = document.querySelector('section[aria-labelledby="key-title"]');
    const txt = el ? el.innerText.replace(/\s+/g, ' ') : '(no key card)';
    const last = window.__keyLog.at(-1);
    if (!last || last[1] !== txt) window.__keyLog.push([Math.round(performance.now() - t0), txt]);
    for (const b of document.querySelectorAll('button')) window.__buttons.add(b.innerText);
    for (const a of document.querySelectorAll('[role=alert]')) if (a.innerText && !window.__alerts.includes(a.innerText)) window.__alerts.push(a.innerText);
  }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
});
const fail = async (name, e) => { const m = e.message.split('\n')[0]; console.log(`!!! ${name} failed: ${m}`); await shot(`${name}-FAILED`, m); };
const step = async (name, fn) => { try { await fn(); } catch (e) { await fail(name, e); } };
const keyCard = () => page.locator('section[aria-labelledby="key-title"]');
const say = async (what) => console.log(`    ${what}: ${JSON.stringify(await page.evaluate(`(${what})`))}`);
const keyLogSince = async (n) => console.log('    keyLog:', JSON.stringify((await page.evaluate(() => window.__keyLog)).slice(n)));
const keyLogLen = () => page.evaluate(() => window.__keyLog.length);

await page.goto('http://127.0.0.1:5181/'); await page.waitForLoadState('networkidle');
await shot('landing');
await step('sign-in', async () => {
  await page.getByLabel('Username').fill('alice');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'Create your vault' }).waitFor();
  await shot('sign-in');
});
await step('create-vault', async () => {
  await page.getByLabel('New passphrase').fill(PASS);
  await page.getByLabel('Confirm passphrase').fill(PASS);
  await page.getByRole('button', { name: 'Create vault' }).click();
  await page.getByText('Your vault is unlocked.').waitFor({ timeout: 30000 });
  await shot('vault-created-unlocked');
});
await step('save-key', async () => {
  await page.getByRole('textbox', { name: 'Anthropic API key' }).fill(KEY);
  await page.getByRole('button', { name: 'Save key' }).click();
  await keyCard().getByText('Saved key:').waitFor();
  await shot('key-saved');
  await say(`[...window.__buttons].filter((t) => t.includes('…'))`);
  await say(`document.querySelector('section[aria-labelledby="key-title"] p.row').innerText`);
  await say(`document.querySelector('input[name=apiKey]').value`);
});
await step('show-key', async () => {
  const before = await keyCard().locator('p.row').innerHTML();
  console.log('    row html before Show:', before);
  await keyCard().locator('p.row').getByRole('button', { name: 'Show' }).click();
  await keyCard().getByText(KEY).waitFor();
  await shot('key-shown');
  console.log('    row html shown:', await keyCard().locator('p.row').innerHTML());
});
await step('hide-key', async () => {
  await keyCard().locator('p.row').getByRole('button', { name: 'Hide' }).click();
  await page.waitForTimeout(200);
  await shot('key-hidden', `key visible: ${await keyCard().getByText(KEY).count()}`);
});
await step('knock', async () => {
  await page.getByLabel("Who's there?").fill('Lettuce');
  await page.getByRole('button', { name: 'Knock' }).click();
  await page.waitForTimeout(100);
  await shot('knocking', `button: ${await page.locator('section[aria-labelledby="knock-title"] button').innerText()}`);
  await page.locator('section[aria-labelledby="knock-title"] [role=alert], section[aria-labelledby="knock-title"] output').first().waitFor({ timeout: 30000 });
  await shot('knock-answered', await page.locator('section[aria-labelledby="knock-title"]').innerText());
  await say(`[...window.__buttons].filter((t) => t.includes('…'))`);
});
await step('lock', async () => {
  const n = await keyLogLen();
  await page.getByRole('button', { name: 'Lock' }).click();
  await page.getByRole('heading', { name: 'Your vault is locked' }).waitFor();
  await shot('locked');
  await keyLogSince(n - 1);
});
await step('show-while-locked', async () => {
  const showBtn = keyCard().locator('p.row').getByRole('button', { name: 'Show' });
  console.log('    Show buttons in key row while locked:', await showBtn.count());
  if (await showBtn.count()) {
    await showBtn.click(); await page.waitForTimeout(500);
    await shot('show-while-locked', `dialog open: ${await page.locator('dialog[open]').count()}`);
    if (await page.locator('dialog[open]').count()) {
      console.log('    dialog:', (await page.locator('dialog[open]').innerText()).replace(/\s+/g, ' '));
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      await shot('dialog-dismissed', `dialog open: ${await page.locator('dialog[open]').count()}`);
    }
  }
});
await step('knock-while-locked', async () => {
  await page.getByLabel("Who's there?").fill('Boo');
  await page.getByRole('button', { name: 'Knock' }).click();
  await page.locator('dialog[open]').waitFor({ timeout: 5000 });
  await shot('knock-locked-dialog', (await page.locator('dialog[open]').innerText()).replace(/\s+/g, ' '));
  await page.locator('dialog[open]').getByLabel('Passphrase').fill(PASS);
  await page.locator('dialog[open]').getByRole('button', { name: /unlock/i }).click();
  await page.locator('section[aria-labelledby="knock-title"] [role=alert], section[aria-labelledby="knock-title"] output').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(300);
  await shot('knock-after-dialog', (await page.locator('section[aria-labelledby="knock-title"]').innerText()).replace(/\s+/g, ' '));
});
await step('lock-again', async () => {
  await page.getByRole('button', { name: 'Lock' }).click();
  await page.getByRole('heading', { name: 'Your vault is locked' }).waitFor();
  await shot('locked-again');
});
await step('reload-locked', async () => {
  await page.reload(); await page.getByRole('heading', { name: 'Your vault is locked' }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  await shot('reloaded-locked');
  await keyLogSince(0);
});
await step('unlock-wrong', async () => {
  await page.getByLabel('Passphrase', { exact: true }).first().fill('not my passphrase at all');
  await page.getByRole('button', { name: /^unlock/i }).first().click();
  await page.waitForTimeout(4000);
  await shot('unlock-wrong', (await page.locator('section[aria-labelledby="locked-title"]').innerText()).replace(/\s+/g, ' '));
});
await step('unlock', async () => {
  await page.getByLabel('Passphrase', { exact: true }).first().fill(PASS);
  await page.getByRole('button', { name: /^unlock/i }).first().click();
  await page.getByText('Your vault is unlocked.').waitFor({ timeout: 30000 });
  await shot('unlocked-again');
});
await step('refused-save', async () => {
  await page.evaluate(() => { window.__realSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); }; });
  await page.getByRole('textbox', { name: 'Anthropic API key' }).fill('sk-ant-api03-SECOND-KEY-0000');
  await page.getByRole('button', { name: 'Replace key' }).click();
  await keyCard().locator('[role=alert]').first().waitFor({ timeout: 10000 });
  await shot('refused-save', (await keyCard().innerText()).replace(/\s+/g, ' '));
  await page.evaluate(() => { Storage.prototype.setItem = window.__realSetItem; });
});
await step('delete-key', async () => {
  await keyCard().getByRole('button', { name: 'Delete' }).click();
  await keyCard().getByText('No key saved yet.').waitFor({ timeout: 10000 });
  await shot('key-deleted');
});
await step('reload-after-delete', async () => {
  await page.reload(); await page.getByRole('heading', { name: 'Your vault is locked' }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  await shot('reloaded-after-delete', (await keyCard().innerText()).replace(/\s+/g, ' '));
});
await say(`window.__alerts`);
await done();
