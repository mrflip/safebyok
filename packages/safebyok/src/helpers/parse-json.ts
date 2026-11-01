/** `text` parsed as JSON, or null where it is none: a SyntaxError can quote what it failed on, so none escapes. */
export const parseJsonOrNull = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
