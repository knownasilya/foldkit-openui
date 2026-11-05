import { Effect, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { Message } from './message.js'
import { QueryManagerResource } from './resources.js'

/** Forces a `Query()` statement to refetch — the `@Run` action step on a query ref. */
export const InvalidateQuery = Command.define('InvalidateQuery', {
  args: { statementId: Schema.String },
  messages: [Message.NoOp],
  execute: ({ statementId }) =>
    QueryManagerResource.get.pipe(
      Effect.map((queryManager) => {
        queryManager.invalidate([statementId])
        return Message.NoOp()
      }),
      Effect.catchTag('ResourceNotAvailable', () => Effect.succeed(Message.NoOp())),
    ),
})

/** Fires a `Mutation()` statement — the `@Run` action step on a mutation ref. Its result surfaces through `QuerySnapshotChanged`. */
export const FireMutation = Command.define('FireMutation', {
  args: { statementId: Schema.String, args: Schema.Unknown },
  messages: [Message.NoOp],
  execute: ({ statementId, args }) =>
    QueryManagerResource.get.pipe(
      Effect.flatMap((queryManager) =>
        Effect.promise(() => queryManager.fireMutation(statementId, args as Record<string, unknown>)),
      ),
      Effect.as(Message.NoOp()),
      Effect.catchTag('ResourceNotAvailable', () => Effect.succeed(Message.NoOp())),
    ),
})
