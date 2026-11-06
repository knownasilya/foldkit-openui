// ─── Component definition ────────────────────────────────────────────────────

export { tagSchemaId } from '@openuidev/lang-core'
export { createLibrary, defineComponent } from './library.js'
export type {
  ComponentGroup,
  ComponentRenderer,
  ComponentRenderProps,
  DefinedComponent,
  Library,
  LibraryDefinition,
  PromptOptions,
  RenderResult,
  SubComponentOf,
} from './library.js'

// ─── Model ────────────────────────────────────────────────────────────────────

export { init, reflectResponse, selectErrors, selectEvaluatedRoot, selectIsQueryLoading } from './model.js'
export type { EvaluatedRoot, Model } from './model.js'

// ─── Tool provider (Query()/Mutation() support) ────────────────────────────────

export { normalizeToolProvider } from './toolProvider.js'
export type { ToolProviderInput } from './toolProvider.js'
export { QueryManagerResource, managedResources } from './resources.js'
export type { QueryManagerService } from './resources.js'
export { subscriptions } from './subscriptions.js'
export { FireMutation, InvalidateQuery, RunSteps } from './commands.js'
export type { RunStep } from './commands.js'
export { buildMutationNodes, buildQueryNodes } from './query.js'

// ─── Message / OutMessage ──────────────────────────────────────────────────────

export { Message, OutMessage } from './message.js'
export type { ActionConfig } from './message.js'

// ─── Update ─────────────────────────────────────────────────────────────────────

export { update } from './update.js'

// ─── View ───────────────────────────────────────────────────────────────────────

export { view } from './view.js'

// ─── Rendering (for advanced/manual use) ───────────────────────────────────────

export { asChildren, renderElementNode, renderNode } from './render.js'

// ─── Re-exports from lang-core (parser, evaluation, types) ────────────────────

export { BuiltinActionType, createLibrary as createCoreLibrary, createParser, evaluate, evaluateElementProps, mergeStatements } from '@openuidev/lang-core'
export type {
  ActionEvent,
  ActionPlan,
  ElementNode,
  EvaluationContext,
  LibraryJSONSchema,
  McpClientLike,
  MutationNode,
  MutationResult,
  OpenUIError,
  ParseResult,
  QueryNode,
  QuerySnapshot,
  ToolProvider,
  ValidationError,
} from '@openuidev/lang-core'
