import { evaluate, type EvaluationContext, type MutationNode, type QueryNode } from '@openuidev/lang-core'
import * as Store from './store.js'
import type { Model } from './model.js'

function toEvaluationContext(model: Model): EvaluationContext {
  return {
    getState: (name) => Store.get(model.store, name),
    resolveRef: (name) => model.querySnapshot?.[name] ?? null,
  }
}

/** Evaluates every `Query()` statement's tool name, args, defaults, and deps against the current store. Pure. */
export function buildQueryNodes(model: Model): ReadonlyArray<QueryNode> {
  const statements = model.parseResult?.queryStatements ?? []
  if (statements.length === 0) return []
  const ctx = toEvaluationContext(model)
  return statements.map((statement) => {
    const deps: Record<string, unknown> = {}
    if (statement.deps) {
      for (const refName of statement.deps) deps[refName] = Store.get(model.store, refName)
    }
    return {
      statementId: statement.statementId,
      toolName: statement.toolAST ? (evaluate(statement.toolAST, ctx) as string) : '',
      args: statement.argsAST ? evaluate(statement.argsAST, ctx) : null,
      defaults: statement.defaultsAST ? evaluate(statement.defaultsAST, ctx) : null,
      refreshInterval: statement.refreshAST ? (evaluate(statement.refreshAST, ctx) as number) : undefined,
      deps: Object.keys(deps).length > 0 ? deps : undefined,
      complete: statement.complete,
    }
  })
}

/** Evaluates every `Mutation()` statement's tool name against the current store. Pure. */
export function buildMutationNodes(model: Model): ReadonlyArray<MutationNode> {
  const statements = model.parseResult?.mutationStatements ?? []
  if (statements.length === 0) return []
  const ctx = toEvaluationContext(model)
  return statements.map((statement) => ({
    statementId: statement.statementId,
    toolName: statement.toolAST ? (evaluate(statement.toolAST, ctx) as string) : '',
  }))
}
