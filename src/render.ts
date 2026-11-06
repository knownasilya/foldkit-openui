import {
  ACTION_STEPS,
  evaluate,
  isReactiveAssign,
  type ActionPlan,
  type ASTNode,
  type ElementNode,
  type EvaluationContext,
} from '@openuidev/lang-core'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { ComponentRenderProps, Library, RenderResult, StateField } from './library.js'
import { Message, type ActionConfig, type Message as MessageType } from './message.js'
import { selectIsQueryLoading } from './model.js'
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
    isQueryLoading: selectIsQueryLoading(model),
    renderNode: (value) => renderNode(value, model, h),
    getFieldValue: (formName, name) => Store.getFieldValue(model.store, formName, name),
    triggerAction: (userMessage, formName, action) =>
      Message.TriggeredAction({ userMessage, formName, action: action as ActionConfig | ActionPlan | undefined }),
    setFieldValue: (formName, componentType, name, value, shouldTriggerSaveCallback = true) =>
      Message.SetFieldValue({ formName, componentType, name, value, shouldTriggerSaveCallback }),
    stateField: (name, bindingValue, componentType) => resolveStateField(model, name, bindingValue, componentType),
  }
}

/** A plain JS value as a literal AST node, so it can ride in a `Set` step. */
function toLiteralAST(value: unknown): ASTNode {
  if (typeof value === 'string') return { k: 'Str', v: value }
  if (typeof value === 'number') return { k: 'Num', v: value }
  if (typeof value === 'boolean') return { k: 'Bool', v: value }
  if (Array.isArray(value)) return { k: 'Arr', els: value.map(toLiteralAST) }
  if (value !== null && typeof value === 'object') {
    return { k: 'Obj', entries: Object.entries(value).map(([key, entry]): [string, ASTNode] => [key, toLiteralAST(entry)]) }
  }
  return { k: 'Null' }
}

/**
 * One Message that writes `value` to `target`, then runs `then`'s steps.
 * Without a `then` plan it is a plain `SetFieldValue`, which also reports
 * `StateChanged` like any other field edit.
 */
function writeThen(
  target: string,
  value: unknown,
  componentType: string | undefined,
  then: ActionConfig | ActionPlan | undefined,
): MessageType {
  const steps = then && 'steps' in then ? then.steps : undefined
  if (!steps) {
    return Message.SetFieldValue({ formName: undefined, componentType, name: target, value, shouldTriggerSaveCallback: true })
  }
  const plan: ActionPlan = { steps: [{ type: ACTION_STEPS.Set, target, valueAST: toLiteralAST(value) }, ...steps] }
  return Message.TriggeredAction({ userMessage: '', formName: undefined, action: plan })
}

function resolveStateField<T>(
  model: Model,
  name: string,
  bindingValue: unknown,
  componentType: string | undefined,
): StateField<T> {
  if (isReactiveAssign(bindingValue)) {
    const { target, expr } = bindingValue
    const context: EvaluationContext = {
      getState: (stateName) => Store.get(model.store, stateName),
      resolveRef: (refName) => model.querySnapshot?.[refName] ?? null,
    }
    return {
      name,
      value: Store.get(model.store, target) as T | undefined,
      // `expr` is `$value` for a plain `$var` argument, or the right-hand
      // side of an inline `$var = <expr>` assignment.
      setValue: (value, then) =>
        writeThen(target, evaluate(expr, { ...context, extraScope: { $value: value } }), componentType, then),
      isReactive: true,
    }
  }
  const stored = Store.getFieldValue(model.store, undefined, name)
  return {
    name,
    value: (stored ?? bindingValue) as T | undefined,
    setValue: (value, then) => writeThen(name, value, componentType, then),
    isReactive: false,
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
