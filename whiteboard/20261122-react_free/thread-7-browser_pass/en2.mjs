import { start } from './lib.mjs';
const PASS = 'violet otter juggles ninety lanterns';
const { page, shot, done } = await start('envman-2');
page.setDefaultTimeout(8000);
const step = async (name, fn) => { try { await fn(); } catch (e) { const m = e.message.split('\n')[0]; console.log(`!!! ${name}: ${m}`); await shot(`${name}-FAILED`, m); } };
const txt = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ');
const row = () => page.locator('section[aria-labelledby="list-title"] li').first();
const valIn = () => row().locator('form input');
const valState = async () => `input type=${await valIn().getAttribute('type')} value=${JSON.stringify(await valIn().inputValue())}; Save disabled=${await row().getByRole('button', { name: 'Save' }).isDisabled()}`;
await page.goto('http://127.0.0.1:5182/'); await page.waitForLoadState('networkidle');
await step('bad-username', async () => {
  await page.getByLabel('Username').fill('Dave!');
  await page.getByRole('button', { name: 'Sign in' }).click(); await page.waitForTimeout(300);
  await shot('bad-username', `${await txt(page.locator('header'))} | input=${await page.getByLabel('Username').inputValue()}`);
});
await step('setup', async () => {
  await page.getByLabel('Username').fill('dave');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('New passphrase').fill(PASS);
  await page.getByLabel('Confirm passphrase').fill(PASS);
  await page.getByRole('button', { name: 'Create vault' }).click();
  await page.getByText('Your vault is unlocked.').waitFor({ timeout: 30000 });
  const add = page.locator('section[aria-labelledby="add-title"]');
  await add.getByRole('textbox', { name: 'Value' }).fill('abc');
  await add.getByRole('button', { name: 'Show' }).click();
  await shot('add-value-shown', `value input type=${await add.getByRole('textbox', { name: 'Value' }).getAttribute('type')}`);
  await add.getByRole('button', { name: 'Hide' }).click();
  await add.getByRole('textbox', { name: 'Title' }).fill('DB_URL');
  await add.getByRole('textbox', { name: 'Value' }).fill('postgres://u:p@h/db');
  await add.getByRole('button', { name: 'Add' }).click();
  await row().locator('form').waitFor();
  await shot('added', await txt(row()));
});
await step('settings-cancel', async () => {
  await row().getByRole('button', { name: 'Settings of DB_URL' }).click();
  const dlg = page.locator('dialog[open]');
  await dlg.getByRole('textbox', { name: 'Title' }).fill('RENAMED');
  await dlg.getByRole('button', { name: 'Cancel' }).click(); await page.waitForTimeout(200);
  await shot('settings-cancelled', `dialog open: ${await page.locator('dialog[open]').count()} | ${await txt(row())} | ${await valState()}`);
  await row().getByRole('button', { name: 'Settings of DB_URL' }).click();
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await shot('settings-escaped', `dialog open: ${await page.locator('dialog[open]').count()}`);
});
await step('lock-with-dirty-draft', async () => {
  await valIn().click(); await valIn().fill('typed-before-lock');
  await page.getByRole('button', { name: 'Lock' }).click();
  await page.getByRole('heading', { name: 'Your vault is locked' }).waitFor(); await page.waitForTimeout(300);
  await shot('locked-dirty', await valState());
});
await step('unlock-check-draft', async () => {
  await page.locator('section[aria-labelledby="locked-title"]').getByLabel('Passphrase', { exact: true }).fill(PASS);
  await page.locator('section[aria-labelledby="locked-title"]').getByRole('button', { name: 'Unlock' }).click();
  await page.getByText('Your vault is unlocked.').waitFor({ timeout: 30000 }); await page.waitForTimeout(300);
  await valIn().click(); await page.waitForTimeout(300);
  await shot('unlocked-draft', await valState());
});
await step('sign-out-in', async () => {
  await page.getByRole('button', { name: 'Sign out' }).click(); await page.waitForLoadState('networkidle');
  await page.getByLabel('Username').fill('dave');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'Your vault is locked' }).waitFor({ timeout: 15000 }); await page.waitForTimeout(300);
  await shot('signed-in-again', await txt(page.locator('main')));
});
await done();
