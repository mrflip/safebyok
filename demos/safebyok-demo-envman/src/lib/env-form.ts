/** The fields of envman's two forms, the add form and the settings dialog: what the user typed, and the sidecar fields read from it. */

import { DayMs, DefaultRotationDays, type EnvSidecar, dayValueOf, epochMsOfDay } from './env-sidecar'
import { formTextOf } from './form-text'

/** The sidecar fields a form sets: all but the mask, which comes from the value. */
export type EnvFields = Readonly<{
  title:              string
  description:        string
  rotation_period_ms: number
  last_rotated_at:    number
}>

/** The text of each of a form's fields but the value, by the field's name. */
export type EnvTexts = Readonly<{
  title:            string
  description:      string
  rotation_days:    string
  last_rotated_day: string
}>

/** The fields of the add form as it opens: blank, but for the default rotation period. */
export const NewEnvTexts: EnvTexts = { title: '', description: '', rotation_days: String(DefaultRotationDays), last_rotated_day: '' }

/** The sidecar fields typed into `form`. Throws when the title is blank, the period is not a whole number of days, or the date is not one.
 * A blank last-rotated day, or the day of `rotatedAt`, reads as `rotatedAt` itself, time of day kept.
 */
export function envFieldsOf(form: FormData, rotatedAt: number): EnvFields {
  const title = formTextOf(form, 'title')
  if (title === '') { throw new Error('Give it a title.') }
  const rotationDays = Number(formTextOf(form, 'rotation_days') || DefaultRotationDays)
  if ((! Number.isSafeInteger(rotationDays)) || (rotationDays < 1)) { throw new Error('The rotation period is a whole number of days, 1 or more.') }
  const rotatedDay = formTextOf(form, 'last_rotated_day')
  const last_rotated_at = ((rotatedDay === '') || (rotatedDay === dayValueOf(rotatedAt))) ? rotatedAt : epochMsOfDay(rotatedDay)
  if (last_rotated_at === undefined) { throw new Error('The last-rotated day is not a date.') }
  return { title, description: formTextOf(form, 'description'), rotation_period_ms: rotationDays * DayMs, last_rotated_at }
}

// Every field of envman's forms is text, never a file.
/** The text typed into each of `form`'s fields but the value, as typed. */
export function envTextsOfForm(form: FormData): EnvTexts {
  return {
    title:            (form.get('title') as string | null) ?? '',
    description:      (form.get('description') as string | null) ?? '',
    rotation_days:    (form.get('rotation_days') as string | null) ?? '',
    last_rotated_day: (form.get('last_rotated_day') as string | null) ?? '',
  }
}

/** The fields of the settings dialog as it opens on `env`. */
export function envTextsOfEnv(env: EnvSidecar): EnvTexts {
  return {
    title:            env.title,
    description:      env.description,
    rotation_days:    String(Math.round(env.rotation_period_ms / DayMs)),
    last_rotated_day: dayValueOf(env.last_rotated_at),
  }
}
