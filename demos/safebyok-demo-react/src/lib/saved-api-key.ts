import type { Box, Device, Vault } from 'safebyok-big'

/** The vaultlabel of the vault where the knock-knock flows keep their API key. */
export const ApiKeyVaultlabel = 'main'

/** The boxlabel of the DOM flow's API key box in that vault. */
export const DomApiKeyBoxlabel = 'anthropic_api_key_fields'

/** The boxlabel of the toolkit flow's API key box in that vault. */
export const ToolkitApiKeyBoxlabel = 'anthropic_api_key_exposed'

/** The boxlabel of the widget flow's API key box in that vault. */
export const WidgetApiKeyBoxlabel = 'anthropic_api_key_sealed'

/** Return the API key saved in the `boxlabel` box of `vault`, or null if there is no vault, box or key.
 * Unlocks the bank if needed, which may ask the user. Does not change whether the box is exposed.
 */
export const extractSavedApiKey = async (vault: Vault | null, boxlabel: string): Promise<string | null> => {
  // Use the vault passed in, never bank.ensureVault: reading a key must not create a vault.
  if (vault === null) { return null }
  await vault.bank.ensureUnlocked()
  const stored = await vault.getBox(boxlabel, { ifAbsent: 'nil' })
  if (stored === null) { return null }
  const { apiKey } = await stored.extractWhisper()
  return ((typeof apiKey === 'string') && (apiKey !== '')) ? apiKey : null
}

/** Return the `boxlabel` box in the user's vault, exposed so that its field can show the saved key.
 * Creates the bank, the vault and an empty box if any is missing, and unlocks the bank if needed: either may ask the user.
 */
export const ensureApiKeyBoxExposed = async (device: Device, boxlabel: string): Promise<Box> => {
  // A user who cancelled the bank's dialog at sign-in is asked again here. A vault is put only in an unlocked bank.
  const bank = await device.ensureBank()
  await bank.ensureUnlocked()
  const vault = await bank.ensureVault({ vaultlabel: ApiKeyVaultlabel })
  const box = await vault.putBox({ boxlabel, whisper: {} }, { ifPresent: 'get', ifAbsent: 'add' })
  // A box that was exposed before a lock still has what was typed, so after an unlock it needs no second expose.
  if (! box.snapshot.isExposed) { await box.expose() }
  return box
}
