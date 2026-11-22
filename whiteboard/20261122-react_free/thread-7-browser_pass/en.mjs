import { start } from './lib.mjs';
const PASS = 'violet otter juggles ninety lanterns';
const { page, shot, done } = await start('envman');
page.setDefaultTimeout(8000);
await page.addInitScript(() => {
  window.__listLog = []; window.__buttons = new Set();
  const t0 = performance.now();
  new MutationObserver(() => {
    const el = document.querySelector('section[aria-labelledby="list-title"]');
    const txt = el ? el.innerText.replace(/\s+/g, ' ') : '(no list)';
    const last = window.__listLog.at(-1);
    if (!last || last[1] !== txt) window.__listLog.push([Math.round(performance.now() - t0), txt]);
    for (const b of document.querySelectorAll('button')) window.__buttons.add(b.innerText);
  }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
});
const step = async (name, fn) => { try { await fn(); } catch (e) { const m = e.message.split('\n')[0]; console.log(`!!! ${name}: ${m}`); await shot(`${name}-FAILED`, m); } };
const txt = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ');
const say = async (what) => console.log(`    ${what}: ${JSON.stringify(await page.evaluate(`(${what})`))}`);
const list = () => page.locator('section[aria-labelledby="list-title"]');
const row = () => list().locator('li').first();
const rowHtml = async () => console.log('    row form html:', await row().locator('form').innerHTML());
const listLogSince = async (n) => console.log('    listLog:', JSON.stringify((await page.evaluate(() => window.__listLog)).slice(n)));
const listLogLen = () => page.evaluate(() => window.__listLog.length);

await page.goto('http://127.0.0.1:5182/'); await page.waitForLoadState('networkidle');
await shot('landing', await txt(page.locator('main')));
await step('sign-in', async () => {
  await page.getByLabel('Username').fill('carol');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'Create your vault' }).waitFor();
  await shot('sign-in');
});
await step('create-vault', async () => {
  await page.getByLabel('New passphrase').fill(PASS);
  await page.getByLabel('Confirm passphrase').fill(PASS);
  await page.getByRole('button', { name: 'Create vault' }).click();
  await page.getByText('Your vault is unlocked.').waitFor({ timeout: 30000 });
  await shot('vault-created-unlocked', await txt(page.locator('main')));
});
await step('add-secret', async () => {
  const add = page.locator('section[aria-labelledby="add-title"]');
  await add.getByRole('textbox', { name: 'Title' }).fill('OPENAI_API_KEY');
  await add.getByRole('textbox', { name: 'Description' }).fill('The staging key');
  await add.getByRole('textbox', { name: 'Value' }).fill('sk-proj-ABCDEF123456-tail9876');
  await shot('add-filled');
  await add.getByRole('button', { name: 'Add' }).click();
  await row().locator('form').waitFor();
  await shot('secret-added', await txt(row()));
  await say(`[...window.__buttons].filter((t) => t.includes('…'))`);
  await rowHtml();
  await say(`[...document.querySelectorAll('section[aria-labelledby="add-title"] input')].map((i) => i.name + '=' + i.value)`);
});
await step('reveal', async () => {
  await row().getByRole('textbox').click();
  await page.waitForTimeout(800);
  await shot('reveal-focus', await txt(row()));
  await rowHtml();
});
const valIn = () => row().locator('form input');
const valState = async () => `input type=${await valIn().getAttribute('type')} value=${JSON.stringify(await valIn().inputValue())}; Save disabled=${await row().getByRole('button', { name: 'Save' }).isDisabled()}; Undo disabled=${await row().getByRole('button', { name: 'Undo' }).isDisabled()}`;
await step('revealed-value', async () => { console.log('    ' + await valState()); });
await step('blur', async () => {
  await page.locator('h1').click(); await page.waitForTimeout(300);
  await shot('blurred', await valState());
});
await step('edit-value', async () => {
  await valIn().click(); await valIn().fill('sk-proj-NEWVALUE-0000-tail1111');
  await shot('edited', await valState());
});
await step('save-value', async () => {
  await row().getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(150);
  await shot('saving', await txt(row()));
  await row().getByRole('button', { name: 'Save' }).isDisabled();
  await page.waitForFunction(() => document.querySelector('section[aria-labelledby="list-title"] li form button[type=submit]').disabled);
  await page.waitForTimeout(300);
  await shot('saved', `${await txt(row())} | ${await valState()}`);
});
await step('settings-open', async () => {
  await row().getByRole('button', { name: 'Settings of OPENAI_API_KEY' }).click();
  const dlg = page.locator('dialog[open]'); await dlg.waitFor();
  await shot('settings-open', await txt(dlg));
  console.log('    dialog aria:\n' + await dlg.ariaSnapshot());
});
await step('settings-bad', async () => {
  const dlg = page.locator('dialog[open]');
  await dlg.getByRole('spinbutton', { name: 'Rotation period in days' }).fill('2.5');
  await dlg.getByRole('button', { name: 'Done' }).click(); await page.waitForTimeout(300);
  await shot('settings-bad', await txt(dlg));
});
await step('settings-apply', async () => {
  const dlg = page.locator('dialog[open]');
  await dlg.getByRole('textbox', { name: 'Description' }).fill('The production key');
  await dlg.getByRole('spinbutton', { name: 'Rotation period in days' }).fill('30');
  await dlg.getByLabel('Last rotated').fill('2026-01-15');
  await dlg.getByRole('button', { name: 'Done' }).click(); await page.waitForTimeout(300);
  await shot('settings-applied', `dialog open: ${await page.locator('dialog[open]').count()} | ${await txt(row())} | ${await valState()}`);
});
await step('settings-save', async () => {
  await row().getByRole('button', { name: 'Save' }).click();
  await page.waitForFunction(() => document.querySelector('section[aria-labelledby="list-title"] li form button[type=submit]').disabled);
  await page.waitForTimeout(300);
  await shot('settings-saved', `${await txt(row())} | class=${await row().getAttribute('class')}`);
});
await step('undo', async () => {
  await valIn().click(); await valIn().fill('typed-then-undone-zzzz');
  await row().getByRole('button', { name: 'Settings of OPENAI_API_KEY' }).click();
  const dlg = page.locator('dialog[open]'); await dlg.waitFor();
  await dlg.getByRole('textbox', { name: 'Description' }).fill('A description to undo');
  await dlg.getByRole('button', { name: 'Done' }).click(); await page.waitForTimeout(300);
  await shot('before-undo', `${await txt(row())} | ${await valState()}`);
  await row().getByRole('button', { name: 'Undo' }).click(); await page.waitForTimeout(300);
  await shot('after-undo', `${await txt(row())} | ${await valState()}`);
});
await step('lock', async () => {
  const n = await listLogLen();
  await page.getByRole('button', { name: 'Lock' }).click();
  await page.getByRole('heading', { name: 'Your vault is locked' }).waitFor();
  await page.waitForTimeout(300);
  await shot('locked', `${await txt(row())} | ${await valState()}`);
  await listLogSince(n - 1);
  await rowHtml();
});
await step('reload-locked', async () => {
  await page.reload(); await page.getByRole('heading', { name: 'Your vault is locked' }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  await shot('reloaded-locked', await txt(row()));
  await listLogSince(0);
});
await step('focus-while-locked', async () => {
  await valIn().click();
  const dlg = page.locator('dialog[open]'); await dlg.waitFor();
  await shot('focus-locked-dialog', await txt(dlg));
  await dlg.getByLabel('Passphrase', { exact: true }).fill(PASS);
  await dlg.getByRole('button', { name: 'Unlock' }).click();
  await page.getByText('Your vault is unlocked.').waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  await shot('dialog-unlocked', `dialog open: ${await page.locator('dialog[open]').count()} | ${await valState()} | focused: ${await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))}`);
});
await step('lock-unlock-form', async () => {
  await page.getByRole('button', { name: 'Lock' }).click();
  await page.getByRole('heading', { name: 'Your vault is locked' }).waitFor();
  await page.locator('section[aria-labelledby="locked-title"]').getByLabel('Passphrase', { exact: true }).fill(PASS);
  await page.locator('section[aria-labelledby="locked-title"]').getByRole('button', { name: 'Unlock' }).click();
  await page.getByText('Your vault is unlocked.').waitFor({ timeout: 30000 });
  await page.waitForTimeout(300);
  await shot('unlocked-form', await txt(page.locator('main')));
});
await step('refused-save', async () => {
  await valIn().click(); await valIn().fill('value-that-will-be-refused');
  await page.evaluate(() => { window.__realSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); }; });
  await row().getByRole('button', { name: 'Save' }).click();
  await row().locator('[role=alert]').first().waitFor({ timeout: 10000 });
  await shot('refused-save', `${await txt(row())} | ${await valState()}`);
  await page.evaluate(() => { Storage.prototype.setItem = window.__realSetItem; });
});
await step('refused-add', async () => {
  await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); }; });
  const add = page.locator('section[aria-labelledby="add-title"]');
  await add.getByRole('textbox', { name: 'Title' }).fill('STRIPE_KEY');
  await add.getByRole('textbox', { name: 'Description' }).fill('Refused one');
  await add.getByRole('textbox', { name: 'Value' }).fill('sk_live_refused');
  await add.getByRole('button', { name: 'Add' }).click();
  await add.locator('[role=alert]').waitFor({ timeout: 10000 });
  await page.evaluate(() => { Storage.prototype.setItem = window.__realSetItem; });
  await shot('refused-add', await txt(add));
  await say(`[...document.querySelectorAll('section[aria-labelledby="add-title"] input')].map((i) => i.name + '=' + i.value)`);
  console.log('    list:', await txt(list()));
});
await done();
