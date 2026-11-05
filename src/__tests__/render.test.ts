import { describe, expect, it } from 'vitest'
import * as Scene from 'foldkit/scene'
import { init, reflectResponse, selectEvaluatedRoot } from '../model.js'
import { update } from '../update.js'
import { view } from '../view.js'
import { testLibrary } from './fixtures.js'

function modelFor(response: string) {
  return reflectResponse(init({ library: testLibrary }), { response, isStreaming: false })
}

describe('rendering', () => {
  it('renders a simple component tree', () => {
    Scene.scene(
      { update, view },
      Scene.given(modelFor('root = Greeting("World")')),
      Scene.expect(Scene.text('Hello, World!')).toExist(),
    )
  })

  it('renders a Card with nested children', () => {
    Scene.scene(
      { update, view },
      Scene.given(
        modelFor(['header = Greeting("World")', 'root = Card("My Card", [header])'].join('\n')),
      ),
      Scene.expect(Scene.text('My Card')).toExist(),
      Scene.expect(Scene.text('Hello, World!')).toExist(),
      Scene.expect(Scene.selector('.card')).toExist(),
    )
  })

  it('renders nothing for an empty response', () => {
    // Scene requires a non-null view; a null root is a model-level fact, so
    // check it directly rather than through a render.
    expect(selectEvaluatedRoot(modelFor('')).root).toBeNull()
  })
})
