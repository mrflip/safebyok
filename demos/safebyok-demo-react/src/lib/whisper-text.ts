import type { Whisper, WhisperJson } from 'safebyok-old'

/** A whisper as the UI prints it: strings bare, everything else as JSON. */
export const showWhisper = (whisper: Whisper): string => (
  typeof whisper === 'string' ? whisper : JSON.stringify(whisper)
)

/** A whisper as an edit box holds it: strings bare, everything else as readable JSON. */
export const editableWhisper = (whisper: Whisper): string => (
  typeof whisper === 'string' ? whisper : JSON.stringify(whisper, null, 2)
)

/**
 * An edit box's text read back into whisper material: valid JSON keeps its type ("42" stores the
 * number 42, "true" the boolean), anything else is stored as the string it is. Typing "null"
 * parses to a bare null, which the vault refuses at store time with its own calm message.
 */
export const parseWhisperText = (text: string): WhisperJson => {
  try {
    return JSON.parse(text) as WhisperJson
  } catch {
    return text
  }
}
