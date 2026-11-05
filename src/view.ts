import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineView } from 'foldkit/submodel'
import type { RenderResult } from './library.js'
import type { Message } from './message.js'
import { selectEvaluatedRoot, type Model } from './model.js'
import { asChildren, renderNode } from './render.js'

// See the matching comment in render.ts: `Array.isArray` alone can't narrow a
// `ReadonlyArray<T>` union member out of the non-matching branch.
function isStringOrList(value: RenderResult): value is string | ReadonlyArray<Html | string | null> {
  return typeof value === 'string' || Array.isArray(value)
}

/** Coerces a component's render result down to the single `Html` node a view must return. */
function toHtml(result: RenderResult, h: HtmlBuilder<Message>): Html {
  if (result === null) return null
  if (isStringOrList(result)) {
    const children = asChildren(result)
    if (children.length === 0) return null
    const [only] = children
    return children.length === 1 && only !== undefined && typeof only !== 'string' ? only : h.div([], children)
  }
  return result
}

/**
 * The OpenUI Submodel's view. Embed it into a host view with `h.submodel`:
 *
 * ```ts
 * h.submodel({
 *   slotId: `openui-${messageId}`,
 *   model: model.openUI,
 *   view: OpenUI.view,
 *   toParentMessage: (message) => Message.GotOpenUIMessage({ messageId, message }),
 * })
 * ```
 */
export const view = defineView<Model, Message>((model, h) => {
  const { root } = selectEvaluatedRoot(model)
  if (!root) return null
  return toHtml(renderNode(root, model, h), h)
})
