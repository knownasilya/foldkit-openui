import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

/** Legacy `{ type, params }` action shape, still accepted by `Action()` in OpenUI Lang v0.5. */
export interface ActionConfig {
  readonly type?: string
  readonly params?: Record<string, unknown>
}

/**
 * Every Message the OpenUI Submodel dispatches internally. Application code
 * never constructs these directly — it gets Messages back from
 * `ComponentRenderProps.triggerAction` / `setFieldValue` and binds them to
 * `h.OnClick`, `h.OnInput`, etc.
 */
export const Message = defineMessageUnion({
  /** A component fired a structured action (a button click, a link, …). */
  TriggeredAction: {
    userMessage: Schema.String,
    formName: Schema.optional(Schema.String),
    action: Schema.optional(Schema.Unknown),
  },
  /** A form field's value changed. */
  SetFieldValue: {
    formName: Schema.optional(Schema.String),
    componentType: Schema.optional(Schema.String),
    name: Schema.String,
    value: Schema.Unknown,
    shouldTriggerSaveCallback: Schema.Boolean,
  },
})
export type Message = typeof Message.Type

/**
 * Facts the OpenUI Submodel reports to its parent. The host handles these in
 * its own `Update.foldChild` / `foldOutMessage` to continue a conversation,
 * persist form state, or follow a link.
 */
export const OutMessage = defineMessageUnion({
  /** One or more structured actions fired by `TriggeredAction`'s ActionPlan. */
  ActionTriggered: {
    events: Schema.Unknown,
  },
  /** The form-field store changed; carries the full snapshot (unwrapped). */
  StateChanged: {
    state: Schema.Unknown,
  },
})
export type OutMessage = typeof OutMessage.Type
