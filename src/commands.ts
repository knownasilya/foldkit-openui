import { Effect, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { Message } from './message.js'
import { QueryManagerResource } from './resources.js'

function fireMutationEffect(statementId: string, args: unknown) {
  return QueryManagerResource.get.pipe(
    Effect.flatMap((queryManager) =>
      Effect.promise(() => queryManager.fireMutation(statementId, args as Record<string, unknown>)),
    ),
  )
}

function invalidateQueryEffect(statementId: string) {
  return QueryManagerResource.get.pipe(
    Effect.map((queryManager) => {
      queryManager.invalidate([statementId])
    }),
  )
}

/** Forces a `Query()` statement to refetch — the `@Run` action step on a query ref, fired standalone. */
export const InvalidateQuery = Command.define('InvalidateQuery', {
  args: { statementId: Schema.String },
  messages: [Message.NoOp],
  execute: ({ statementId }) =>
    invalidateQueryEffect(statementId).pipe(
      Effect.as(Message.NoOp()),
      Effect.catchTag('ResourceNotAvailable', () => Effect.succeed(Message.NoOp())),
    ),
})

/** Fires a `Mutation()` statement — the `@Run` action step on a mutation ref, fired standalone. Its result surfaces through `QuerySnapshotChanged`. */
export const FireMutation = Command.define('FireMutation', {
  args: { statementId: Schema.String, args: Schema.Unknown },
  messages: [Message.NoOp],
  execute: ({ statementId, args }) =>
    fireMutationEffect(statementId, args).pipe(
      Effect.as(Message.NoOp()),
      Effect.catchTag('ResourceNotAvailable', () => Effect.succeed(Message.NoOp())),
    ),
})

/** One `@Run` step within an `Action([...])` plan, in source order. */
export interface RunStep {
  readonly statementId: string
  readonly refType: 'mutation' | 'query'
  readonly args?: unknown
}

/**
 * Runs every `@Run` step of a single `Action([...])` plan **in order**, each
 * one waited on before the next starts — a mutation's write must land before
 * a later `@Run` on a query re-fetches it, or the refetch races the write
 * and reads stale data. Replaces dispatching `FireMutation`/`InvalidateQuery`
 * independently for a multi-step plan, which has no such ordering guarantee.
 * Per OpenUI Lang's own semantics, a failed mutation halts the remaining steps.
 */
export const RunSteps = Command.define('RunSteps', {
  args: {
    steps: Schema.Array(
      Schema.Struct({
        statementId: Schema.String,
        refType: Schema.Literals(['mutation', 'query']),
        args: Schema.optional(Schema.Unknown),
      }),
    ),
  },
  messages: [Message.NoOp],
  execute: ({ steps }) =>
    Effect.gen(function* () {
      for (const step of steps) {
        if (step.refType === 'mutation') {
          const outcome = yield* fireMutationEffect(step.statementId, step.args).pipe(Effect.result)
          if (outcome._tag === 'Failure') break
        } else {
          yield* invalidateQueryEffect(step.statementId).pipe(Effect.result)
        }
      }
      return Message.NoOp()
    }),
})
