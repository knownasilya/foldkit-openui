import type { MutationNode, QueryManager, QueryNode } from '@openuidev/lang-core'
import { Effect, Queue, Schema, Stream } from 'effect'
import * as Subscription from 'foldkit/subscription'
import { buildMutationNodes, buildQueryNodes } from './query.js'
import { Message, type Message as MessageType } from './message.js'
import type { Model } from './model.js'
import { QueryManagerResource, type QueryManagerService } from './resources.js'

/** Bridges the QueryManager's `subscribe` callback — fired on every fetch start/resolve/error — into a Message carrying the fresh snapshot. */
function streamQueryManagerUpdates(queryManager: QueryManager) {
  return Stream.callback<typeof Message.QuerySnapshotChanged.Type>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() =>
        queryManager.subscribe(() => {
          Queue.offerUnsafe(queue, Message.QuerySnapshotChanged({ snapshot: queryManager.getSnapshot() }))
        }),
      ),
      (unsubscribe) => Effect.sync(unsubscribe),
    ).pipe(Effect.flatMap(() => Effect.never)),
  )
}

/**
 * Keeps the QueryManager's query/mutation statements in sync with the parsed
 * program and current store, and streams its state changes into the Model.
 * Lift this into your host's own `subscriptions` with `Subscription.lift`
 * alongside `managedResources` from [`resources.ts`](./resources.ts).
 */
export const subscriptions = Subscription.make<Model, MessageType, QueryManagerService>()((entry) => ({
  queryManagerUpdates: entry(
    { ready: Schema.Boolean },
    {
      modelToDependencies: (model) => ({ ready: model.queryManagerReady }),
      dependenciesToStream: ({ ready }) => {
        if (!ready) return Stream.empty
        return Stream.unwrap(
          QueryManagerResource.get.pipe(
            Effect.map(streamQueryManagerUpdates),
            Effect.catchTag('ResourceNotAvailable', () => Effect.succeed(Stream.empty)),
          ),
        )
      },
    },
  ),
  evaluateQueries: entry(
    { ready: Schema.Boolean, queryNodes: Schema.Any, mutationNodes: Schema.Any },
    {
      modelToDependencies: (model) => ({
        ready: model.queryManagerReady && !model.isStreaming,
        queryNodes: buildQueryNodes(model),
        mutationNodes: buildMutationNodes(model),
      }),
      dependenciesToStream: ({ ready, queryNodes, mutationNodes }) => {
        if (!ready) return Stream.empty
        return Stream.unwrap(
          QueryManagerResource.get.pipe(
            Effect.map((queryManager) => {
              queryManager.evaluateQueries(queryNodes as ReadonlyArray<QueryNode> as QueryNode[])
              queryManager.registerMutations(mutationNodes as ReadonlyArray<MutationNode> as MutationNode[])
              return Stream.empty
            }),
            Effect.catchTag('ResourceNotAvailable', () => Effect.succeed(Stream.empty)),
          ),
        )
      },
    },
  ),
}))
