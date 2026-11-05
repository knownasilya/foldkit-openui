import {
  createLibrary as coreCreateLibrary,
  defineComponent as coreDefineComponent,
  type ComponentRenderProps as CoreComponentRenderProps,
  type DefinedComponent as CoreDefinedComponent,
  type Library as CoreLibrary,
  type LibraryDefinition as CoreLibraryDefinition,
} from '@openuidev/lang-core'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { z } from 'zod'
import type { $ZodObject } from 'zod/v4/core'
import type { ActionPlan } from '@openuidev/lang-core'
import type { ActionConfig, Message } from './message.js'

// Re-export framework-agnostic types unchanged.
export type { ComponentGroup, PromptOptions, SubComponentOf } from '@openuidev/lang-core'

// ─── Foldkit-specific rendering types ────────────────────────────────────────

/**
 * What a component renderer may hand back to its caller to be spliced into
 * an element's children: a built node, raw text, a list of either (nested
 * arrays are flattened), or nothing.
 */
export type RenderResult = Html | string | ReadonlyArray<Html | string | null> | null

/** Props passed to every Foldkit component renderer. */
export interface ComponentRenderProps<P = Record<string, unknown>>
  extends CoreComponentRenderProps<P, RenderResult> {
  /** The builder for this renderer's Message universe — the OpenUI Submodel's own. */
  readonly h: HtmlBuilder<Message>
  /** Whether the model is still streaming; components typically disable inputs while true. */
  readonly isStreaming: boolean
  /** Whether any `Query()` is currently fetching; a component can use this to show a loading indicator. */
  readonly isQueryLoading: boolean
  /** Read a form field's current value. Returns undefined if not set. */
  readonly getFieldValue: (formName: string | undefined, name: string) => unknown
  /** Build a Message that fires a structured action when dispatched. Accepts a component's evaluated `action` prop directly — a legacy `{ type, params }` config, a parsed `ActionPlan`, or neither. */
  readonly triggerAction: (userMessage: string, formName?: string, action?: ActionConfig | ActionPlan) => Message
  /** Build a Message that updates a form field's value when dispatched. */
  readonly setFieldValue: (
    formName: string | undefined,
    componentType: string | undefined,
    name: string,
    value: unknown,
    shouldTriggerSaveCallback?: boolean,
  ) => Message
}

export type ComponentRenderer<P = Record<string, unknown>> = (args: ComponentRenderProps<P>) => RenderResult

export type DefinedComponent<T extends $ZodObject = $ZodObject> = CoreDefinedComponent<
  T,
  ComponentRenderer<z.infer<T>>
>

export type Library = CoreLibrary<ComponentRenderer<any>>

export type LibraryDefinition = CoreLibraryDefinition<ComponentRenderer<any>>

// ─── defineComponent ──────────────────────────────────────────────────────────

/**
 * Define a component with name, schema, description, and a Foldkit renderer.
 *
 * @example
 * ```ts
 * const Greeting = defineComponent({
 *   name: 'Greeting',
 *   description: 'Displays a greeting message',
 *   props: z.object({ name: z.string() }),
 *   component: ({ props, h }) => h.div([], [`Hello, ${props.name}!`]),
 * })
 * ```
 */
export function defineComponent<T extends $ZodObject>(config: {
  name: string
  props: T
  description: string
  component: ComponentRenderer<z.infer<T>>
}): DefinedComponent<T> {
  return coreDefineComponent<T, ComponentRenderer<z.infer<T>>>(config)
}

// ─── createLibrary ────────────────────────────────────────────────────────────

/**
 * Create a component library from an array of defined components.
 *
 * @example
 * ```ts
 * const library = createLibrary({ components: [Greeting, Card], root: 'Card' })
 * ```
 */
export function createLibrary(input: LibraryDefinition): Library {
  return coreCreateLibrary<ComponentRenderer<any>>(input) as Library
}
