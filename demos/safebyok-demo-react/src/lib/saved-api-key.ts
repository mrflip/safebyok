import type { Bank, Box, Vault } from 'safebyok'

/** The vaultlabel the knock-knock flows keep their API key under. */
export const ApiKeyVaultlabel = 'main'

/** The boxlabel of the managed-fields flow's API key box in that vault. */
export const FieldsApiKeyBoxlabel = 'anthropic_api_key_fields'

/** The boxlabel of the exposed-whisper flow's API key box in that vault. */
export const ExposedApiKeyBoxlabel = 'anthropic_api_key_exposed'

/** The API key as saved in `boxlabel`'s box of `vault`, unlocking it as needed, or null where there is none; the box's exposure is left as it was. */
export const extractSavedApiKey = async (vault: Vault | null, boxlabel: string): Promise<string | null> => {
  // The vault in hand, never bank.ensureVault: a knock with no vault builds none.
  if (vault === null) { return null }
  await vault.ensureUnlocked()
  const stored = await vault.getBox(boxlabel, { ifAbsent: 'nil' })
  if (stored === null) { return null }
  const { apiKey } = await stored.extractWhisper()
  return ((typeof apiKey === 'string') && (apiKey !== '')) ? apiKey : null
}

/** The `boxlabel` box in the user's vault, built with the vault as needed and exposed so its field has the saved key to show. */
export const ensureApiKeyBoxExposed = async (bank: Bank, boxlabel: string): Promise<Box> => {
  const vault = await bank.ensureVault({ vaultlabel: ApiKeyVaultlabel })
  await vault.ensureUnlocked()
  const box = await vault.putBox({ boxlabel, whisper: {} }, { ifPresent: 'get', ifAbsent: 'add' })
  // Exposed before a lock, it holds what was typed: an unlock alone brings the edit back.
  if (! box.snapshot.exposed) { await box.expose() }
  return box
}
