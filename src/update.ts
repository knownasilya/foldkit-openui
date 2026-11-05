import {
  ACTION_STEPS,
  BuiltinActionType,
  evaluate,
  type ActionEvent,
  type ActionPlan,
  type EvaluationContext,
} from '@openuidev/lang-core'
import type * as Update from 'foldkit/update'
import type { Model } from './model.js'
import { Message, OutMessage, type ActionConfig, type Message as MessageType, type OutMessage as OutMessageType } from './message.js'
import * as Store from './store.js'
import type { StoreState } from './store.js'

type Return = Update.ReturnWithOutMessage<Model, MessageType, OutMessageType>

/** Handles every Message a rendered component can dispatch. */
export function update(model: Model, message: MessageType): Return {
  return Message.match(message, {
    SetFieldValue: ({ formName, componentType, name, value, shouldTriggerSaveCallback }) => {
      const store = Store.setFieldValue(model.store, formName, componentType, name, value)
      const nextModel: Model = { ...model, store }
      if (!shouldTriggerSaveCallback) return { model: nextModel }
      return { model: nextModel, outMessage: OutMessage.StateChanged({ state: nextModel.store.snapshot }) }
    },
    TriggeredAction: ({ userMessage, formName, action }) =>
      runAction(model, userMessage, formName, action as ActionConfig | ActionPlan | undefined),
  })
}

function toEvaluationContext(store: StoreState): EvaluationContext {
  return {
    getState: (name) => Store.get(store, name),
    resolveRef: () => null,
  }
}

function defaultEvent(store: StoreState, userMessage: string, formName: string | undefined): ActionEvent {
  return {
    type: BuiltinActionType.ContinueConversation,
    params: {},
    humanFriendlyMessage: userMessage,
    formState: Store.getFormPayload(store, formName),
    formName,
  }
}

function runAction(
  model: Model,
  userMessage: string,
  formName: string | undefined,
  action: (ActionConfig | ActionPlan) | undefined,
): Return {
  // Legacy `{ type?, params? }` config (OpenUI Lang v0.1 compat).
  if (action && !('steps' in action)) {
    const event: ActionEvent = {
      type: action.type ?? BuiltinActionType.ContinueConversation,
      params: { ...(action.params ?? {}) },
      humanFriendlyMessage: userMessage,
      formState: Store.getFormPayload(model.store, formName),
      formName,
    }
    return { model, outMessage: OutMessage.ActionTriggered({ events: [event] }) }
  }

  const actionPlan = action as ActionPlan | undefined
  if (!actionPlan?.steps) {
    return { model, outMessage: OutMessage.ActionTriggered({ events: [defaultEvent(model.store, userMessage, formName)] }) }
  }

  let store = model.store
  const events: ActionEvent[] = []

  for (const step of actionPlan.steps) {
    switch (step.type) {
      case ACTION_STEPS.Run:
        // Query()/Mutation() tool calls are out of scope for this renderer.
        console.warn('[foldkit-openui] Action step "run" (Query/Mutation) is not supported; skipping.')
        break
      case ACTION_STEPS.ToAssistant:
        events.push({
          type: BuiltinActionType.ContinueConversation,
          params: step.context ? { context: step.context } : {},
          humanFriendlyMessage: step.message,
          formState: Store.getFormPayload(store, formName),
          formName,
        })
        break
      case ACTION_STEPS.OpenUrl:
        events.push({
          type: BuiltinActionType.OpenUrl,
          params: { url: step.url },
          humanFriendlyMessage: '',
          formState: Store.getFormPayload(store, formName),
          formName,
        })
        break
      case ACTION_STEPS.Set: {
        const value = evaluate(step.valueAST, toEvaluationContext(store))
        store = Store.set(store, step.target, value)
        break
      }
      case ACTION_STEPS.Reset: {
        const declarations = model.parseResult?.stateDeclarations ?? {}
        for (const target of step.targets) {
          store = Store.set(store, target, declarations[target] ?? null)
        }
        break
      }
    }
  }

  const nextModel: Model = { ...model, store }
  if (events.length === 0) return { model: nextModel }
  return { model: nextModel, outMessage: OutMessage.ActionTriggered({ events }) }
}
