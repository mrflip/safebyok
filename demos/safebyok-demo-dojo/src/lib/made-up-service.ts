/** The dojo's stand-ins for a service that checks an API key and for a slow save: neither calls anything, and neither keeps what it is handed. */

/** The prefix every dojo API key starts with. */
export const KeyPrefix = 'sk-dojo-'

/** The fewest characters in a dojo API key, its prefix included. */
export const KeyMinChars = 20

/** How long the made-up service takes to answer a check. */
export const CheckMs = 300

/** How long a made-up save takes. */
export const SaveMs = 2000

/** Whether the made-up service accepts `apiKey`: true for a key of the dojo's shape, answered after {@link CheckMs}, as a call to a real service would be. */
export async function isKeyAccepted(apiKey: string): Promise<boolean> {
  await new Promise((resolve) => { setTimeout(resolve, CheckMs) })
  return apiKey.startsWith(KeyPrefix) && (apiKey.length >= KeyMinChars)
}

/** Pretend to save what `_form` holds, resolving after {@link SaveMs}. */
export async function saveMadeUp(_form: FormData): Promise<void> {
  await new Promise((resolve) => { setTimeout(resolve, SaveMs) })
}
