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

export { init, reflectResponse, selectErrors, selectEvaluatedRoot } from './model.js'
export type { EvaluatedRoot, Model } from './model.js'

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

export { BuiltinActionType, createLibrary as createCoreLibrary, createParser, evaluate, evaluateElementProps } from '@openuidev/lang-core'
export type {
  ActionEvent,
  ActionPlan,
  ElementNode,
  EvaluationContext,
  LibraryJSONSchema,
  OpenUIError,
  ParseResult,
  ValidationError,
} from '@openuidev/lang-core'
