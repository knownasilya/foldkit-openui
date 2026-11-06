import { z } from 'zod'
import { tagSchemaId, type ActionConfig, type ActionPlan } from 'foldkit-openui'

// Shared prop vocabulary, after Nuxt UI's `color`/`variant`/`size` props
// (https://ui.nuxt.com). Every component maps these to data attributes and
// index.html styles them, so one CSS rule set covers the whole library.

export const COLORS = ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'] as const
export type Color = (typeof COLORS)[number]

export const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const
export type Size = (typeof SIZES)[number]

export const color = (fallback: Color = 'primary') => z.enum(COLORS).default(fallback)
export const size = (fallback: Size = 'md') => z.enum(SIZES).default(fallback)

/** An `Action([...])` prop. Tagged so the prompt shows `ActionExpression` and adds its Action section. */
const actionExpression = z.unknown()
tagSchemaId(actionExpression, 'ActionExpression')
export const action = () => actionExpression.optional()

export const asAction = (value: unknown) => value as ActionConfig | ActionPlan | undefined

/** Children may be one node or a list; always hand the renderer a list. */
export const children = () => z.array(z.unknown()).default([])

/** Initials for an avatar fallback: "Ada Lovelace" → "AL". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? [words[0]![0], words[words.length - 1]![0]] : [name.trim().slice(0, 2)]
  return letters.join('').toUpperCase()
}

/** The props of a sub-component element (SelectItem, TabItem, …) as its parent sees them. */
export function subProps<P>(node: unknown): P | null {
  if (typeof node !== 'object' || node === null) return null
  const element = node as { type?: unknown; props?: unknown }
  return element.type === 'element' && typeof element.props === 'object' ? (element.props as P) : null
}
