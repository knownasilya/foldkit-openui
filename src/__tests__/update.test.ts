import { describe, expect, it } from 'vitest'
import * as Scene from 'foldkit/scene'
import type { ActionPlan } from '@openuidev/lang-core'
import { init, reflectResponse } from '../model.js'
import { Message, OutMessage } from '../message.js'
import { update } from '../update.js'
import { view } from '../view.js'
import { testLibrary } from './fixtures.js'

function modelFor(response: string) {
  return reflectResponse(init({ library: testLibrary }), { response, isStreaming: false })
}

describe('update', () => {
  it('fires a legacy-config action with the clicked button label', () => {
    Scene.scene(
      { update, view },
      Scene.given(modelFor('root = Button("Say hi", {type: "continue_conversation"})')),
      Scene.click(Scene.selector('button')),
      Scene.expectOutMessage(
        OutMessage.ActionTriggered({
          events: [
            {
              type: 'continue_conversation',
              params: {},
              humanFriendlyMessage: 'Say hi',
              formState: {},
              formName: undefined,
            },
          ],
        }),
      ),
    )
  })

  it('writes and reads back a form field through SetFieldValue', () => {
    const model = modelFor('root = TextInput("email")')
    const changed = update(model, Message.SetFieldValue({
      name: 'email',
      value: 'a@example.com',
      shouldTriggerSaveCallback: true,
    }))
    expect(changed.model.store.snapshot.email).toEqual({ value: 'a@example.com', componentType: undefined })
    expect(changed.outMessage).toEqual(OutMessage.StateChanged({ state: changed.model.store.snapshot }))

    Scene.scene(
      { update, view },
      Scene.given(changed.model),
      Scene.expect(Scene.selector('input')).toHaveValue('a@example.com'),
    )
  })

  it('does not emit StateChanged when shouldTriggerSaveCallback is false', () => {
    const model = modelFor('root = TextInput("email")')
    const changed = update(model, Message.SetFieldValue({
      name: 'email',
      value: 'typing...',
      shouldTriggerSaveCallback: false,
    }))
    expect(changed.outMessage).toBeUndefined()
  })

  it('interprets an ActionPlan: Set then ToAssistant, as one OutMessage with both events', () => {
    const model = modelFor('root = Greeting("World")')
    const plan: ActionPlan = {
      steps: [
        { type: 'set', target: '$count', valueAST: { k: 'Num', v: 1 } },
        { type: 'continue_conversation', message: 'Incremented' },
        { type: 'open_url', url: 'https://example.com' },
      ],
    }
    const result = update(model, Message.TriggeredAction({ userMessage: 'Go', action: plan }))
    expect(result.model.store.snapshot.$count).toBe(1)
    // formState reflects the store as of each step — the Set step already ran
    // by the time ToAssistant/OpenUrl capture it, same as the reference renderers.
    expect(result.outMessage).toEqual(
      OutMessage.ActionTriggered({
        events: [
          {
            type: 'continue_conversation',
            params: {},
            humanFriendlyMessage: 'Incremented',
            formState: { $count: 1 },
            formName: undefined,
          },
          {
            type: 'open_url',
            params: { url: 'https://example.com' },
            humanFriendlyMessage: '',
            formState: { $count: 1 },
            formName: undefined,
          },
        ],
      }),
    )
  })

  it('resets targets to their declared $state defaults', () => {
    const model = modelFor('$count = 0\nroot = Greeting("World")')
    const withCount = update(model, Message.TriggeredAction({
      userMessage: 'bump',
      action: { steps: [{ type: 'set', target: '$count', valueAST: { k: 'Num', v: 5 } }] },
    }))
    expect(withCount.model.store.snapshot.$count).toBe(5)

    const reset = update(withCount.model, Message.TriggeredAction({
      userMessage: 'reset',
      action: { steps: [{ type: 'reset', targets: ['$count'] }] },
    }))
    expect(reset.model.store.snapshot.$count).toBe(0)
  })

  it('fires a mutation command with evaluated args from the matching Mutation() statement', () => {
    const base = modelFor('root = Greeting("World")')
    const model = {
      ...base,
      parseResult: {
        ...base.parseResult!,
        mutationStatements: [
          {
            statementId: 'createItem',
            toolAST: { k: 'Str' as const, v: 'create_item' },
            argsAST: { k: 'Obj' as const, entries: [['name', { k: 'StateRef' as const, n: '$name' }]] as [string, import('@openuidev/lang-core').ASTNode][] },
          },
        ],
      },
      store: { snapshot: { $name: 'Widget' }, pristineKeys: {} },
    }

    const plan: ActionPlan = { steps: [{ type: 'run', statementId: 'createItem', refType: 'mutation' }] }
    const result = update(model, Message.TriggeredAction({ userMessage: 'Create', action: plan }))

    expect(result.commands).toHaveLength(1)
    expect(result.commands?.[0]).toMatchObject({
      name: 'RunSteps',
      args: { steps: [{ statementId: 'createItem', refType: 'mutation', args: { name: 'Widget' } }] },
    })
  })

  it('invalidates a query via a run step with refType "query"', () => {
    const model = modelFor('root = Greeting("World")')
    const plan: ActionPlan = { steps: [{ type: 'run', statementId: 'users', refType: 'query' }] }
    const result = update(model, Message.TriggeredAction({ userMessage: 'Refresh', action: plan }))

    expect(result.commands).toHaveLength(1)
    expect(result.commands?.[0]).toMatchObject({
      name: 'RunSteps',
      args: { steps: [{ statementId: 'users', refType: 'query' }] },
    })
  })

  it('runs a mutation then a query refetch in order, as a single sequenced command (not two racing ones)', () => {
    const base = modelFor('root = Greeting("World")')
    const model = {
      ...base,
      parseResult: {
        ...base.parseResult!,
        mutationStatements: [{ statementId: 'createItem', toolAST: { k: 'Str' as const, v: 'create_item' }, argsAST: null }],
      },
    }
    const plan: ActionPlan = {
      steps: [
        { type: 'run', statementId: 'createItem', refType: 'mutation' },
        { type: 'run', statementId: 'items', refType: 'query' },
      ],
    }
    const result = update(model, Message.TriggeredAction({ userMessage: 'Create', action: plan }))

    expect(result.commands).toHaveLength(1)
    expect(result.commands?.[0]).toMatchObject({
      name: 'RunSteps',
      args: {
        steps: [
          { statementId: 'createItem', refType: 'mutation', args: {} },
          { statementId: 'items', refType: 'query' },
        ],
      },
    })
  })

  it('stores the query snapshot on QuerySnapshotChanged', () => {
    const model = modelFor('root = Greeting("World")')
    const snapshot = { __openui_loading: [], __openui_refetching: [], __openui_errors: [], users: [1, 2, 3] }
    const result = update(model, Message.QuerySnapshotChanged({ snapshot }))
    expect(result.model.querySnapshot).toEqual(snapshot)
  })

  it('records a failed QueryManager acquisition as a surfaced error', () => {
    const model = modelFor('root = Greeting("World")')
    const result = update(model, Message.FailedAcquireQueryManager({ error: 'offline' }))
    expect(result.model.queryManagerError).toBe('offline')
  })
})
