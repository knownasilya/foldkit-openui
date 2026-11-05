import { createParser, evaluateElementProps, type ElementNode, type EvalContext, type OpenUIError, type ParseResult } from '@openuidev/lang-core'
import { Function as Fn } from 'effect'
import type { Reflect } from 'foldkit/submodel'
import type { Library } from './library.js'
import { applyStateDeclarations, emptyStore, get as getStoreValue, type StoreState } from './store.js'

export interface Model {
  readonly library: Library
  readonly response: string | null
  readonly isStreaming: boolean
  readonly parseResult: ParseResult | null
  readonly store: StoreState
}

/** Creates the initial Model. Call once when the host mounts the renderer. */
export function init(options: {
  library: Library
  initialState?: Record<string, unknown>
}): Model {
  let store = emptyStore
  if (options.initialState) {
    for (const [key, value] of Object.entries(options.initialState)) {
      store = { snapshot: { ...store.snapshot, [key]: value }, pristineKeys: store.pristineKeys }
    }
  }
  return {
    library: options.library,
    response: null,
    isStreaming: false,
    parseResult: null,
    store,
  }
}

/**
 * Conforms the Model to the response text and streaming flag the host owns.
 * Call this from the host's own `update` whenever either changes — it is
 * pure and synchronous (OpenUI Lang's grammar tolerates partial/truncated
 * input by design, so a plain one-shot parse on every change is simpler,
 * and just as correct, as porting the incremental streaming parser).
 */
export const reflectResponse: Reflect<Model, { response: string | null; isStreaming: boolean }> = Fn.dual(
  2,
  (model: Model, value: { response: string | null; isStreaming: boolean }): Model => {
    if (value.response === model.response) {
      return model.isStreaming === value.isStreaming ? model : { ...model, isStreaming: value.isStreaming }
    }
    const parseResult = value.response
      ? createParser(model.library.toJSONSchema(), model.library.root).parse(value.response)
      : null
    const store = applyStateDeclarations(model.store, parseResult?.stateDeclarations ?? {})
    return { ...model, response: value.response, isStreaming: value.isStreaming, parseResult, store }
  },
)

/** The evaluated root element, ready to render, plus any errors raised while evaluating it. */
export interface EvaluatedRoot {
  readonly root: ElementNode | null
  readonly errors: ReadonlyArray<OpenUIError>
}

/** Evaluates the parsed root's props against the current store. Pure; safe to call every render. */
export function selectEvaluatedRoot(model: Model): EvaluatedRoot {
  const parsedRoot = model.parseResult?.root ?? null
  if (!parsedRoot) return { root: null, errors: [] }
  const errors: OpenUIError[] = []
  const evalCtx: EvalContext = {
    ctx: {
      getState: (name) => getStoreValue(model.store, name),
      resolveRef: () => null,
    },
    library: model.library,
    store: null,
    errors,
  }
  const root = evaluateElementProps(parsedRoot, evalCtx)
  return { root, errors }
}

/** All structured, LLM-friendly errors available for the current Model: parse + evaluation. */
export function selectErrors(model: Model): ReadonlyArray<OpenUIError> {
  const parseErrors = model.parseResult?.meta.errors ?? []
  const parserErrors: OpenUIError[] = parseErrors.map((error) => ({
    source: 'parser',
    code: error.code,
    message: error.message,
    component: error.component,
    path: error.path || undefined,
    statementId: error.statementId,
  }))
  const { errors: runtimeErrors } = selectEvaluatedRoot(model)
  return [...parserErrors, ...runtimeErrors]
}
