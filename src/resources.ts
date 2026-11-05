import { createQueryManager, type QueryManager } from '@openuidev/lang-core'
import { Effect, Option, Schema } from 'effect'
import * as ManagedResource from 'foldkit/managedResource'
import { Message, type Message as MessageType } from './message.js'
import type { Model } from './model.js'

/** Identity for the live `QueryManager` instance while a `toolProvider` is set. Access it in a Command with `QueryManagerResource.get`. */
export const QueryManagerResource = ManagedResource.tag<QueryManager>()('OpenUIQueryManager')
export type QueryManagerService = ManagedResource.ServiceOf<typeof QueryManagerResource>

/**
 * Acquires a `QueryManager` whenever `Model.toolProvider` is set, and
 * disposes it when it's cleared. `toolProvider` is normalized once at
 * `init` and never reassigned, so it stays referentially stable — the
 * resource acquires once and is never needlessly re-created.
 */
export const managedResources = ManagedResource.make<Model, MessageType>()((entry) => ({
  queryManager: entry(Schema.Option(Schema.Any), {
    resource: QueryManagerResource,
    modelToMaybeRequirements: (model) => Option.fromNullishOr(model.toolProvider),
    acquire: (toolProvider) =>
      Effect.sync(() => {
        const queryManager = createQueryManager(toolProvider as NonNullable<Model['toolProvider']>)
        queryManager.activate()
        return queryManager
      }),
    release: (queryManager) => Effect.sync(() => queryManager.dispose()),
    onAcquired: () => Message.AcquiredQueryManager(),
    onReleased: () => Message.ReleasedQueryManager(),
    onAcquireError: (error) =>
      Message.FailedAcquireQueryManager({ error: error instanceof Error ? error.message : String(error) }),
  }),
}))
