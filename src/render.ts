import type { ActionPlan, ElementNode } from '@openuidev/lang-core'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { ComponentRenderProps, Library, RenderResult } from './library.js'
import { Message, type ActionConfig, type Message as MessageType } from './message.js'
import * as Store from './store.js'
import type { Model } from './model.js'

/** `@openuidev/lang-core` 0.4.x has no exported type guard for `ElementNode`; this mirrors the reference renderers' own inline check. */
function isElementNode(value: unknown): value is ElementNode {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'element'
}

/**
 * Renders any parsed/evaluated value: an `ElementNode` becomes its
 * component's output, an array is flattened recursively, primitives
 * stringify, and `null`/`undefined` render nothing.
 */
export function renderNode(value: unknown, model: Model, h: HtmlBuilder<MessageType>): RenderResult {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const rendered = renderNode(item, model, h)
      return Array.isArray(rendered) ? rendered : [rendered]
    })
  }
  if (isElementNode(value)) return renderElementNode(value, model, h)
  return null
}

function buildRenderProps<P>(
  node: ElementNode,
  props: P,
  model: Model,
  h: HtmlBuilder<MessageType>,
): ComponentRenderProps<P> {
  return {
    props,
    statementId: node.statementId,
    h,
    isStreaming: model.isStreaming,
    renderNode: (value) => renderNode(value, model, h),
    getFieldValue: (formName, name) => Store.getFieldValue(model.store, formName, name),
    triggerAction: (userMessage, formName, action) =>
      Message.TriggeredAction({ userMessage, formName, action: action as ActionConfig | ActionPlan | undefined }),
    setFieldValue: (formName, componentType, name, value, shouldTriggerSaveCallback = true) =>
      Message.SetFieldValue({ formName, componentType, name, value, shouldTriggerSaveCallback }),
  }
}

// `Array.isArray` cannot narrow a `ReadonlyArray<T>` union member out of the
// non-array branch (a readonly array isn't a subtype of its `any[]` guard
// type), so a custom predicate — typed as `ReadonlyArray<T>` itself — stands
// in for it here.
function isRenderResultList(value: RenderResult): value is ReadonlyArray<Html | string | null> {
  return Array.isArray(value)
}

/**
 * Flattens any `renderNode`/`props.children` result into a plain children
 * array, for a container component to spread into its own element:
 *
 * ```ts
 * h.div([h.Class('card')], [h.h2([], [props.title]), ...asChildren(renderNode(props.children))])
 * ```
 */
export function asChildren(result: RenderResult): ReadonlyArray<Html | string> {
  if (result === null) return []
  if (isRenderResultList(result)) {
    return result.filter((item): item is Html | string => item !== null)
  }
  return [result]
}

/** Looks up an `ElementNode`'s component in the library and calls its renderer. */
export function renderElementNode(node: ElementNode, model: Model, h: HtmlBuilder<MessageType>): RenderResult {
  const componentDef = (model.library as Library).components[node.typeName]
  if (!componentDef) {
    console.warn(`[foldkit-openui] Unknown component "${node.typeName}" (statement "${node.statementId}")`)
    return null
  }
  try {
    return componentDef.component(buildRenderProps(node, node.props, model, h))
  } catch (error) {
    console.error(`[foldkit-openui] "${node.typeName}" failed to render:`, error)
    return null
  }
}
