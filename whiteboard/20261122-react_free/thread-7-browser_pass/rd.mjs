import { start } from './lib.mjs';
const PASS = 'violet otter juggles ninety lanterns';
const { page, shot, done } = await start('react');
page.setDefaultTimeout(8000);
const step = async (name, fn) => { try { await fn(); } catch (e) { const m = e.message.split('\n')[0]; console.log(`!!! ${name}: ${m}`); await shot(`${name}-FAILED`, m); } };
const txt = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ');
await page.goto('http://127.0.0.1:5183/'); await page.waitForLoadState('networkidle');
await shot('landing', await txt(page.locator('body')));
await step('sign-in', async () => {
  await page.getByRole('textbox', { name: 'username' }).fill('erin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForTimeout(2000);
  await shot('signed-in', await txt(page.locator('body')));
});
const widget = () => page.getByRole('region', { name: 'Widget form' });
await step('create-vault', async () => {
  const dlg = page.getByRole('dialog', { name: 'Choose a vault passphrase' });
  await dlg.getByRole('textbox', { name: 'vault passphrase', exact: true }).fill(PASS);
  await dlg.getByRole('textbox', { name: 'confirm vault passphrase' }).fill(PASS);
  await dlg.getByRole('button', { name: 'Create vault' }).click();
  await dlg.waitFor({ state: 'hidden', timeout: 30000 });
  await page.waitForTimeout(500);
  await shot('vault-created', await txt(page.locator('main')));
});
await step('save-key', async () => {
  await widget().getByRole('textbox', { name: 'Anthropic API key' }).fill('sk-ant-api03-OLDDEMO-qrst');
  await widget().getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(1500);
  await shot('key-saved', await txt(widget()));
});
await step('show-hide', async () => {
  const show = widget().getByRole('button', { name: 'Show' });
  console.log('    Show buttons:', await show.count());
  await show.last().click(); await page.waitForTimeout(500);
  await shot('shown', await txt(widget()));
  const hide = widget().getByRole('button', { name: 'Hide' });
  if (await hide.count()) { await hide.last().click(); await page.waitForTimeout(300); await shot('hidden', await txt(widget())); }
});
await step('knock', async () => {
  await widget().getByRole('textbox', { name: "Who's there?" }).fill('Orange');
  await widget().getByRole('button', { name: 'Knock' }).click();
  await page.waitForTimeout(4000);
  await shot('knocked', await txt(widget()));
});
await step('lock', async () => {
  const lock = page.getByRole('button', { name: /lock/i });
  console.log('    lock-ish buttons:', await lock.allInnerTexts());
  await lock.first().click(); await page.waitForTimeout(800);
  await shot('locked', await txt(page.locator('main')));
});
await step('unlock', async () => {
  await page.getByRole('region', { name: 'Account' }).getByRole('button', { name: 'Unlock' }).click();
  const dlg = page.getByRole('dialog'); await dlg.waitFor();
  await shot('unlock-dialog', await txt(dlg));
  await dlg.getByRole('textbox').first().fill(PASS);
  await dlg.getByRole('button', { name: /unlock/i }).click();
  await dlg.waitFor({ state: 'hidden', timeout: 30000 }); await page.waitForTimeout(500);
  await shot('unlocked', await txt(page.getByRole('region', { name: 'Account' })));
});
await step('reload', async () => {
  await page.reload(); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1500);
  await shot('reloaded', await txt(page.locator('main')));
});
await done();
