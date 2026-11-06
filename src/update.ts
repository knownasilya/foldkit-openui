import {
  ACTION_STEPS,
  BuiltinActionType,
  evaluate,
  type ActionEvent,
  type ActionPlan,
  type EvaluationContext,
} from '@openuidev/lang-core'
import type { Command } from 'foldkit/command'
import type * as Update from 'foldkit/update'
import { RunSteps, type RunStep } from './commands.js'
import type { Model } from './model.js'
import { Message, OutMessage, type ActionConfig, type Message as MessageType, type OutMessage as OutMessageType } from './message.js'
import type { QueryManagerService } from './resources.js'
import * as Store from './store.js'
import type { StoreState } from './store.js'

type Return = Update.ReturnWithOutMessage<Model, MessageType, OutMessageType, QueryManagerService>

/**
 * Handles every Message a rendered component can dispatch, plus the QueryManager's lifecycle Messages.
 *
 * Fold this with `Update.foldChild` in your host's own `update`, not a plain
 * call that copies back only `.model` — this can return Commands (a
 * `TriggeredAction`'s `@Run` steps fire `FireMutation`/`InvalidateQuery` via
 * `RunSteps`), and a plain call silently drops them: the button "succeeds"
 * with no error, but the mutation/query refetch never happens. See the
 * package README's "Actions and forms" and "Query() and Mutation()" sections.
 */
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
    QuerySnapshotChanged: ({ snapshot }) => ({
      model: { ...model, querySnapshot: snapshot as Model['querySnapshot'] },
    }),
    AcquiredQueryManager: () => ({ model: { ...model, queryManagerReady: true, queryManagerError: null } }),
    ReleasedQueryManager: () => ({ model: { ...model, queryManagerReady: false, querySnapshot: null } }),
    FailedAcquireQueryManager: ({ error }) => ({
      model: { ...model, queryManagerReady: false, queryManagerError: error },
    }),
    NoOp: () => ({ model }),
  })
}

function toEvaluationContext(model: Model, store: StoreState): EvaluationContext {
  return {
    getState: (name) => Store.get(store, name),
    resolveRef: (name) => model.querySnapshot?.[name] ?? null,
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
  const runSteps: RunStep[] = []

  for (const step of actionPlan.steps) {
    switch (step.type) {
      case ACTION_STEPS.Run: {
        if (step.refType === 'mutation') {
          const mutationStatement = model.parseResult?.mutationStatements.find(
            (statement) => statement.statementId === step.statementId,
          )
          const evaluatedArgs = mutationStatement?.argsAST
            ? (evaluate(mutationStatement.argsAST, toEvaluationContext(model, store)) as Record<string, unknown>)
            : {}
          runSteps.push({ statementId: step.statementId, refType: 'mutation', args: evaluatedArgs })
        } else {
          runSteps.push({ statementId: step.statementId, refType: 'query' })
        }
        break
      }
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
        const value = evaluate(step.valueAST, toEvaluationContext(model, store))
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

  const commands: Array<Command<MessageType, never, QueryManagerService>> = runSteps.length > 0 ? [RunSteps({ steps: runSteps })] : []

  const nextModel: Model = { ...model, store }
  if (events.length === 0 && commands.length === 0) return { model: nextModel }
  if (events.length === 0) return { model: nextModel, commands }
  return { model: nextModel, commands, outMessage: OutMessage.ActionTriggered({ events }) }
}
