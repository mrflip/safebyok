/** What envman stores beside each secret, readable while the vault is locked: its title, description, rotation period and when it was last rotated. */

import type { Sidecar } from 'safebyok'
import { mask } from 'safebyok-react'

/** One day, in milliseconds. */
export const DayMs = 24 * 60 * 60 * 1000

/** The rotation period a new secret is given, in days. */
export const DefaultRotationDays = 90

/** An env's sidecar, as envman stores it. Times are UTC epoch milliseconds. */
export type EnvSidecar = Readonly<{
  title:              string
  description:        string
  /** How long the value may go unrotated before its row turns red. */
  rotation_period_ms: number
  /** When the value was last replaced. */
  last_rotated_at:    number
  /** The value's mask, from {@link valMaskOf}: no character of its tail. */
  mask:               string
}>

/** The env sidecar in `sidecar`, a field missing or of the wrong type read as empty, or as rotated never. */
export function envSidecarOf(sidecar: Sidecar): EnvSidecar {
  return {
    title:              textOf(sidecar['title']),
    description:        textOf(sidecar['description']),
    rotation_period_ms: numberOr(sidecar['rotation_period_ms'], DefaultRotationDays * DayMs),
    last_rotated_at:    numberOr(sidecar['last_rotated_at'], 0),
    mask:               textOf(sidecar['mask']),
  }
}

// The sidecar is stored readable, so the mask shows no character of the value's tail.
/** The mask of the value `val` to store in the sidecar. */
export function valMaskOf(val: string): string { return mask(val, { tail: 0 }) }

/** True when the env was last rotated longer ago than its period, at `now`. */
export function isOverdueAt(env: EnvSidecar, now: number): boolean {
  return (now - env.last_rotated_at) > env.rotation_period_ms
}

/** A fresh label for a new env's box: `env_` and 32 random hex digits. */
export function newEnvLabel(): string { return `env_${globalThis.crypto.randomUUID().replaceAll('-', '')}` }

/** The day of `epochMs`, as a date input's value (`2026-11-21`), in UTC. */
export function dayValueOf(epochMs: number): string { return new Date(epochMs).toISOString().slice(0, 10) }

/** The time a date input's value names, midnight UTC; undefined for a value that is not a date. */
export function epochMsOfDay(dayValue: string): number | undefined {
  const epochMs = Date.parse(`${dayValue}T00:00:00Z`)
  return Number.isNaN(epochMs) ? undefined : epochMs
}

/** `val` if it is text, else empty. */
function textOf(val: unknown): string { return (typeof val === 'string') ? val : '' }

/** `val` if it is a finite number, else `fallback`. */
function numberOr(val: unknown, fallback: number): number { return Number.isFinite(val) ? (val as number) : fallback }
