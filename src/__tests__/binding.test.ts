import { describe, expect, it } from 'vitest'
import * as Scene from 'foldkit/scene'
import { RunSteps } from '../commands.js'
import { Message } from '../message.js'
import { init, reflectResponse } from '../model.js'
import { update } from '../update.js'
import { view } from '../view.js'
import { testLibrary } from './fixtures.js'

function modelFor(response: string) {
  return reflectResponse(init({ library: testLibrary }), { response, isStreaming: false })
}

describe('reactive() props', () => {
  it('shows a reactive prop as $binding in the prompt', () => {
    expect(testLibrary.prompt()).toContain('BoundInput(name: string, value?: $binding<string>)')
  })

  it('reads a $variable default and writes typed text back to it', () => {
    Scene.scene(
      { update, view },
      Scene.given(modelFor('$title = "Hi"\nroot = Card("Edit", [field, echo])\nfield = BoundInput("title", $title)\necho = Greeting($title)')),
      Scene.expect(Scene.selector('input')).toHaveValue('Hi'),
      Scene.expect(Scene.text('Hello, Hi!')).toExist(),
      Scene.type(Scene.selector('input'), 'Ada'),
      Scene.expect(Scene.selector('input')).toHaveValue('Ada'),
      Scene.expect(Scene.text('Hello, Ada!')).toExist(),
    )
  })

  it('falls back to the named form field when no $variable is bound', () => {
    const model = modelFor('root = BoundInput("note")')
    Scene.scene(
      { update, view },
      Scene.given(model),
      Scene.type(Scene.selector('input'), 'draft'),
      Scene.expect(Scene.selector('input')).toHaveValue('draft'),
    )
  })

  it('writes the new value before running the action, so a Mutation sees it', () => {
    const source = [
      '$done = false',
      'root = BoundToggle("Done", $done, Action([@Run(save)]))',
      'save = Mutation("save_task", {done: $done})',
    ].join('\n')
    Scene.scene(
      { update, view },
      Scene.given(modelFor(source)),
      Scene.click(Scene.selector('input')),
      Scene.Command.expectHas(
        RunSteps({ steps: [{ statementId: 'save', refType: 'mutation', args: { done: true } }] }),
      ),
      Scene.Command.resolve(RunSteps, Message.NoOp()),
      Scene.expect(Scene.selector('input')).toBeChecked(),
    )
  })
})
