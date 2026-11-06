// WebMCP bridge: exposes the playground to in-browser AI agents through
// `navigator.modelContext` (https://github.com/webmachinelearning/webmcp),
// so an agent can read the component library and build a layout itself.
//
// Tools never touch the Model directly. Each call becomes a Message carrying
// a `reply` callback; `update` works out the result from the current Model
// and replies through a Command — the same path a textarea edit takes, so
// the agent and the human always see one consistent layout.

import { Effect, Queue, Stream } from 'effect'

/** The tools whose answers depend on (or change) the Model, routed through `update`. */
export type ModelTool =
  | { readonly name: 'get_layout' }
  | { readonly name: 'set_layout'; readonly source: string }
  | { readonly name: 'patch_layout'; readonly patch: string }
  | { readonly name: 'load_preset'; readonly preset: string }
  | { readonly name: 'get_action_log' }

/** An MCP `CallToolResult`, the shape WebMCP agents (and the MCP-B polyfill) expect back. */
export interface ToolResult {
  readonly content: ReadonlyArray<{ readonly type: 'text'; readonly text: string }>
  readonly isError?: boolean
}

export interface ToolCall {
  readonly tool: ModelTool
  readonly reply: (result: ToolResult) => void
}

export function jsonResult(value: unknown, isError = false): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], ...(isError ? { isError } : {}) }
}

export function textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] }
}

// ─── Minimal WebMCP typings ──────────────────────────────────────────────────

interface WebMcpTool {
  readonly name: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>
  readonly annotations?: { readonly readOnlyHint?: boolean }
  readonly execute: (input: Record<string, unknown>) => Promise<ToolResult>
}

interface ModelContext {
  registerTool: (tool: WebMcpTool, options?: { signal?: AbortSignal }) => { unregister?: () => void } | void
  unregisterTool?: (name: string) => void
}

function getModelContext(): ModelContext | null {
  const modelContext = (globalThis.navigator as { modelContext?: ModelContext } | undefined)?.modelContext
  return modelContext && typeof modelContext.registerTool === 'function' ? modelContext : null
}

/** Whether this browser exposes `navigator.modelContext` (natively, or via an extension/polyfill). */
export function isWebMcpAvailable(): boolean {
  return getModelContext() !== null
}

// ─── Tool definitions ────────────────────────────────────────────────────────

export interface ToolContext {
  /** The OpenUI Lang system prompt for the playground's component library. */
  readonly languageReference: () => string
  readonly presets: ReadonlyArray<{ readonly name: string; readonly description: string }>
  /** Route a Model-dependent call through the app's `update`. */
  readonly dispatch: (call: ToolCall) => void
}

const stringInput = (key: string, description: string) => ({
  type: 'object',
  properties: { [key]: { type: 'string', description } },
  required: [key],
})

function viaUpdate(dispatch: ToolContext['dispatch'], tool: ModelTool): Promise<ToolResult> {
  return new Promise((reply) => dispatch({ tool, reply }))
}

function requireString(input: Record<string, unknown>, key: string): string | ToolResult {
  const value = input?.[key]
  return typeof value === 'string' ? value : jsonResult({ error: `"${key}" must be a string` }, true)
}

function buildTools(context: ToolContext): WebMcpTool[] {
  const { dispatch } = context
  return [
    {
      name: 'get_openui_lang_reference',
      description:
        'Returns the OpenUI Lang reference for this playground: syntax rules and the signature of every available component (Card, Row, Heading, Paragraph, Button, Badge, TextField, ItemList) plus the get_items/add_item tools usable from Query()/Mutation(). Read this before writing a layout.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => textResult(context.languageReference()),
    },
    {
      name: 'get_layout',
      description:
        'Returns the current OpenUI Lang source shown in the playground editor, plus any parser/runtime errors it currently has.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => viaUpdate(dispatch, { name: 'get_layout' }),
    },
    {
      name: 'set_layout',
      description:
        'Replaces the whole layout with a new OpenUI Lang program (one `name = Expression` statement per line; the first statement must be `root = ...`). The preview re-renders immediately. Returns any parser/runtime errors — fix them and call again if the list is non-empty.',
      inputSchema: stringInput('source', 'The complete OpenUI Lang program.'),
      execute: async (input) => {
        const source = requireString(input, 'source')
        return typeof source === 'string' ? viaUpdate(dispatch, { name: 'set_layout', source }) : source
      },
    },
    {
      name: 'patch_layout',
      description:
        'Edits the current layout incrementally. Send only new or changed statements: a statement with an existing name replaces it, a new name is appended. To remove a component, re-declare its parent without it; unreachable statements are garbage-collected. Returns the merged source and any errors.',
      inputSchema: stringInput('patch', 'One or more OpenUI Lang statements to merge into the current program.'),
      execute: async (input) => {
        const patch = requireString(input, 'patch')
        return typeof patch === 'string' ? viaUpdate(dispatch, { name: 'patch_layout', patch }) : patch
      },
    },
    {
      name: 'list_presets',
      description: 'Lists the built-in example layouts, which are useful as starting points or as syntax examples.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => jsonResult(context.presets.map(({ name, description }) => ({ name, description }))),
    },
    {
      name: 'load_preset',
      description: 'Loads one of the built-in example layouts (by name, from list_presets) into the editor and returns its source.',
      inputSchema: {
        type: 'object',
        properties: { preset: { type: 'string', enum: context.presets.map(({ name }) => name) } },
        required: ['preset'],
      },
      execute: async (input) => {
        const preset = requireString(input, 'preset')
        return typeof preset === 'string' ? viaUpdate(dispatch, { name: 'load_preset', preset }) : preset
      },
    },
    {
      name: 'get_action_log',
      description:
        'Returns the action log: Action()s the user fired by clicking buttons and form-state changes, newest last. Use it to check that buttons you added behave as intended.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => viaUpdate(dispatch, { name: 'get_action_log' }),
    },
  ]
}

function registerTools(modelContext: ModelContext, tools: WebMcpTool[]): () => void {
  const controller = new AbortController()
  const registrations = tools.map((tool) => {
    try {
      return { tool, handle: modelContext.registerTool(tool, { signal: controller.signal }) }
    } catch (error) {
      console.warn(`[webmcp] could not register tool "${tool.name}"`, error)
      return null
    }
  })
  return () => {
    controller.abort()
    for (const registration of registrations) {
      if (!registration) continue
      try {
        if (registration.handle && typeof registration.handle.unregister === 'function') registration.handle.unregister()
        else modelContext.unregisterTool?.(registration.tool.name)
      } catch {
        // Already unregistered via the abort signal.
      }
    }
  }
}

/**
 * A Stream that registers the playground's tools for as long as it runs and
 * emits one Message per Model-dependent tool call. Empty when the browser has
 * no `navigator.modelContext`.
 */
export function toolCalls<Message>(
  context: Omit<ToolContext, 'dispatch'>,
  toMessage: (call: ToolCall) => Message,
): Stream.Stream<Message> {
  const modelContext = getModelContext()
  if (!modelContext) return Stream.empty
  return Stream.callback<Message>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() =>
        registerTools(
          modelContext,
          buildTools({ ...context, dispatch: (call) => Queue.offerUnsafe(queue, toMessage(call)) }),
        ),
      ),
      (unregister) => Effect.sync(unregister),
    ).pipe(Effect.flatMap(() => Effect.never)),
  )
}
