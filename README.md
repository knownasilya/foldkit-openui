# foldkit-openui

[Foldkit](https://foldkit.dev) bindings for [OpenUI Lang](https://openui.com/docs/openui-lang) — define components, generate a system prompt, and render streamed, model-generated UI as Foldkit views.

This is the Foldkit counterpart to [`@openuidev/vue-lang`](https://www.npmjs.com/package/@openuidev/vue-lang) and [`@openuidev/react-lang`](https://www.npmjs.com/package/@openuidev/react-lang) — same idea (OpenUI Lang's parser and runtime do the real work; this package is the framework binding), adapted to Foldkit's architecture rather than ported line for line. See [Architecture](#architecture) for what's different and why.

## Install

```bash
npm install foldkit-openui @openuidev/lang-core foldkit effect zod
```

**Peer dependencies:** `foldkit >=0.170.0`, `effect >=4.1.0`, `zod ^3.25.0 || ^4.0.0`. Built against `@openuidev/lang-core ^0.4.1` (OpenUI Lang 0.5), the same line `@openuidev/vue-lang` targets.

## Quick start

### 1. Define components

A component renderer is a plain function: `props` in, `Html` out, with `h` (this renderer's own `HtmlBuilder`) and a small context for actions and form fields.

```ts
import { z } from 'zod'
import { defineComponent } from 'foldkit-openui'

const Greeting = defineComponent({
  name: 'Greeting',
  description: 'Displays a greeting message',
  props: z.object({ name: z.string() }),
  component: ({ props, h }) => h.div([h.Class('greeting')], [`Hello, ${props.name}!`]),
})

const Button = defineComponent({
  name: 'Button',
  description: 'A clickable button that fires an action',
  props: z.object({ label: z.string(), action: z.unknown().optional() }),
  component: ({ props, h, triggerAction }) =>
    h.button([h.OnClick(triggerAction(props.label, undefined, props.action))], [props.label]),
})
```

### 2. Create a library and generate a prompt

```ts
import { createLibrary } from 'foldkit-openui'

const library = createLibrary({ components: [Greeting, Button] })

const systemPrompt = library.prompt({
  preamble: 'You are a helpful assistant.',
  examples: ['root = Greeting("Alice")'],
})
```

### 3. Embed the renderer in your app

The renderer is a Foldkit **Submodel**: it has its own `Model`, `Message`, `update`, and `view`, and you embed it with `h.submodel` the same way you'd embed any Foldkit UI Submodel (a `Dialog`, a `Menu`, …).

```ts
import { Option, Schema } from 'effect'
import * as Update from 'foldkit/update'
import { defineMessageUnion } from 'foldkit/message'
import * as OpenUI from 'foldkit-openui'

interface Model {
  readonly response: string | null
  readonly isStreaming: boolean
  readonly openUI: OpenUI.Model
}

const Message = defineMessageUnion({
  GotResponseChunk: { response: Schema.String, isStreaming: Schema.Boolean },
  GotOpenUI: { message: Schema.Any },
})

const init = (): Update.Return<Model, Message> => ({
  model: { response: null, isStreaming: false, openUI: OpenUI.init({ library }) },
})

// Fold the Submodel's update with `Update.foldChild` rather than calling
// `OpenUI.update` and copying back only its `model` — a plain call silently
// drops any Commands a TriggeredAction returns (FireMutation/InvalidateQuery/
// RunSteps for a Query()/Mutation() `@Run` step), so a button wired to one
// would appear to do nothing. foldChild lifts those Commands into your own.
const foldOpenUI = Update.foldChild({
  update: OpenUI.update,
  read: (model: Model) => Option.some(model.openUI),
  write: (model: Model, openUI: OpenUI.Model) => ({ ...model, openUI }),
  toParentMessage: (message: OpenUI.Message): Message => Message.GotOpenUI({ message }),
  // outMessage is OpenUI.OutMessage.ActionTriggered({ events }) or
  // OpenUI.OutMessage.StateChanged({ state }) — see "Actions and forms" below.
  foldOutMessage: (outMessage) => (model) => ({ model }),
})

const update = (model: Model, message: Message) =>
  Message.match(message, {
    GotResponseChunk: ({ response, isStreaming }) => ({
      model: { ...model, response, isStreaming, openUI: OpenUI.reflectResponse(model.openUI, { response, isStreaming }) },
    }),
    GotOpenUI: ({ message }) => foldOpenUI(model, message),
  })

const view = (model: Model, h) =>
  h.submodel({
    slotId: 'assistant-message',
    model: model.openUI,
    view: OpenUI.view,
    toParentMessage: (message) => Message.GotOpenUI({ message }),
  })
```

`reflectResponse` conforms the Submodel to response text your app owns (a streaming chat message, typically) — it's pure and synchronous, so call it directly from your own `update` whenever the text changes, rather than round-tripping through a Message. See [`foldkit/submodel`'s `Reflect`](https://foldkit.dev) for the pattern.

## Actions and forms

`ComponentRenderProps` gives every component renderer:

| Field | Type | |
| :--- | :--- | :--- |
| `props` | `P` | The component's evaluated props |
| `h` | `HtmlBuilder<Message>` | This renderer's own builder — the only one whose handlers route through this Submodel |
| `renderNode` | `(value: unknown) => RenderResult` | Renders a child prop value (an `ElementNode`, an array of them, or a primitive) |
| `statementId` | `string \| undefined` | The source statement name, e.g. `"header"` |
| `isStreaming` | `boolean` | Disable inputs while the model is still streaming |
| `getFieldValue` | `(formName, name) => unknown` | Read a form field's current value |
| `triggerAction` | `(userMessage, formName?, action?) => Message` | Build a Message for `h.OnClick`, etc. |
| `setFieldValue` | `(formName, componentType, name, value, shouldSave?) => Message` | Build a Message for `h.OnInput`, etc. |
| `stateField` | `(name, bindingValue, componentType?) => StateField` | Resolve a `reactive()` prop to its value and a writer (see [Two-way bindings](#two-way-bindings)) |

`triggerAction`/`setFieldValue` **build** Messages — they don't dispatch anything themselves. Bind the result to an event: `h.OnClick(triggerAction(...))`. When `update` handles that Message, it may return an `OutMessage`:

- `OutMessage.ActionTriggered({ events })` — one or more `ActionEvent`s (a legacy `{ type, params }` config, or every `ToAssistant`/`OpenUrl` step from an `ActionPlan`, in order). Continue the conversation, open a URL, etc.
- `OutMessage.StateChanged({ state })` — the form-field store changed and `shouldTriggerSaveCallback` was `true`; persist it alongside the message if you want it restored on reload (pass it back as `OpenUI.init({ library, initialState })`).

Fold the Submodel's update with `Update.foldChild`, as shown above, to receive `OutMessage` in your own `update` — and, just as importantly, to forward the Commands a `TriggeredAction` can return (see [Query() and Mutation()](#query-and-mutation)). Calling `OpenUI.update` directly and copying back only its `model` compiles fine but silently drops those Commands.

For a container component, flatten a `renderNode` result with the exported `asChildren` helper:

```ts
const Card = defineComponent({
  name: 'Card',
  props: z.object({ title: z.string(), children: z.array(z.unknown()) }),
  description: 'A titled container',
  component: ({ props, h, renderNode }) =>
    h.div([h.Class('card')], [h.h2([], [props.title]), ...asChildren(renderNode(props.children))]),
})
```

### Two-way bindings

Wrap a prop's schema in `reactive()` to make it bindable. The prompt shows it as `$binding<type>`, and the model can pass a `$variable` to it: `Input("title", $title)`. Wrap the outermost schema, after `.optional()` or `.default()`.

In the renderer, `stateField` turns the prop into a value and a writer. With a `$variable` bound, it reads and writes that variable. Otherwise it falls back to the form field called `name`, then to the literal prop:

```ts
const Input = defineComponent({
  name: 'Input',
  description: 'A text input',
  props: z.object({ name: z.string(), value: reactive(z.string().optional()) }),
  component: ({ props, h, stateField }) => {
    const field = stateField<string>(props.name, props.value, 'Input')
    return h.input([h.Value(field.value ?? ''), h.OnInput((value) => field.setValue(value))])
  },
})
```

Anything that reads `$title` sees the new value on the next render: a `Text($title)`, a ternary, or a `Mutation("add_todo", {title: $title})`. `field.setValue(value, action)` also takes an `ActionPlan`. It writes the value first and then runs the plan, in one Message, so a `Mutation()` in that plan gets the new value in its args. A checkbox that saves on click uses this.

## Query() and Mutation()

Pass a tool provider — an MCP-like client, or a plain map of tool name to handler — to `init`, and `Query()`/`Mutation()` statements in the model's output call it:

```ts
const openUI = OpenUI.init({
  library,
  toolProvider: {
    get_users: (args) => fetch('/api/users?' + new URLSearchParams(args)).then((r) => r.json()),
    create_ticket: (args) => fetch('/api/tickets', { method: 'POST', body: JSON.stringify(args) }).then((r) => r.json()),
  },
})
```

The live `QueryManager` this creates is a Foldkit **ManagedResource** with its own **Subscription** bridging its async state into the Model — lift both into your host's own config (`managedResources`/`subscriptions` on `Runtime.makeApplication`/`makeElement`), the same way you lift any Foldkit UI Submodel's resources:

```ts
import { Option } from 'effect'
import * as ManagedResource from 'foldkit/managedResource'
import * as Subscription from 'foldkit/subscription'

const managedResources = ManagedResource.lift(OpenUI.managedResources)<Model, Message>({
  read: (model) => Option.some(model.openUI),
  toParentMessage: (message) => Message.GotOpenUI({ message }),
})

const subscriptions = Subscription.lift(OpenUI.subscriptions)<Model, Message>({
  read: (model) => Option.some(model.openUI),
  toParentMessage: (message) => Message.GotOpenUI({ message }),
})

Runtime.run(Runtime.makeApplication({ /* ...Model, init, update, view... */, managedResources, subscriptions, container }))
```

Without this, `toolProvider` is still normalized and stored, but no `QueryManager` ever acquires, so `Query()`/`Mutation()` statements just never resolve (their bound props stay `null`).

**`@Run` only works if you fold the Submodel's update with `Update.foldChild`** (see [Actions and forms](#actions-and-forms)), not by calling `OpenUI.update` and copying back only its `model`. A button's `@Run(mutationRef)`/`@Run(queryRef)` steps reach the `QueryManager` through Commands (`FireMutation`/`InvalidateQuery`/`RunSteps`) that `update` returns alongside the new Model — a manual `GotOpenUI` handler that only does `{ model: { ...model, openUI: result.model } }` throws those away. The click still "succeeds" with no error and no effect, which makes this easy to miss until you go looking for why a mutation never fires.

A few things worth knowing:

- `toolProvider` is normalized once at `init` and fixed for the Submodel's lifetime. To swap it, remount the Submodel (give `h.submodel` a new `slotId`) rather than reassigning the field — the `QueryManager` ManagedResource relies on it staying referentially stable so it doesn't needlessly tear down and reconnect.
- A component bound to a `Query()` result (via a reference, e.g. `items = Query(...)` then `List(items)`) sees `null` until the first fetch resolves — not `undefined` — so a Zod `.default()` on that prop won't apply. Handle `null` explicitly in the component (`props.items ?? []`).
- `isQueryLoading` on `ComponentRenderProps` (and the exported `selectIsQueryLoading(model)`) tells you whether any query is currently fetching, for a loading indicator.
- The `@Run` action step is supported for both refs: on a query, it force-refetches (`invalidate`); on a mutation, it evaluates that `Mutation()` statement's own declared args and fires it. Multiple `@Run` steps in one `Action([...])` run **in order, each waited on before the next starts** (one combined `RunSteps` Command, not independent ones) — so `Action([@Run(createResult), @Run(data)])` is safe: the mutation's write completes before the query refetches it. A mutation's result does not currently resolve through `resolveRef` into a component prop — only `Query()` results do; observe a mutation's effect through what it changes server-side (and the queries you refetch alongside it), not by binding its own result into a prop.
- The form-validation composable layer `vue-lang` ships (`createFormValidation`, `builtInValidators`, …) is still out of scope.

## Example

[`example/`](./example) is a small Vite + Foldkit app: a text area holds raw OpenUI Lang (standing in for a streaming LLM response), and the right pane re-renders live as you edit it, with fired actions and form-state changes logged below. It also wires up a mock `toolProvider` so the `Query("get_items", {})` statement in the default source resolves to a real (fake) list, demonstrating the `ManagedResource`/`Subscription` lift described above.

```bash
cd example
npm install
npm run dev
```

## Playground

[`playground/`](./playground) is the deployed demo: presets, a live editor, and the rendered output. It also exposes [WebMCP](https://github.com/webmachinelearning/webmcp) tools on `navigator.modelContext`, so an AI agent running in the browser can build a layout itself. The header badge shows whether WebMCP is available. You need a browser with WebMCP enabled, or a WebMCP extension/polyfill.

| Tool | What it does |
| --- | --- |
| `get_openui_lang_reference` | The OpenUI Lang system prompt for the playground's components, including the edit-mode rules and the mock `get_items`/`add_item` tools |
| `get_layout` | Current source plus parser/runtime errors |
| `set_layout` | Replace the whole program; returns errors |
| `patch_layout` | Merge new or changed statements by name (`mergeStatements`), garbage-collecting unreachable ones; returns the merged source and errors |
| `list_presets` / `load_preset` | Built-in example layouts |
| `get_action_log` | Actions and state changes fired from the preview |

Every call goes through the app's `update` as a Message, so agent edits and keyboard edits share one Model.

```bash
cd playground
npm install
npm run dev
```

It is live at <https://foldkit-openui-playground.knownasilya.workers.dev>. Each push to `main` that passes CI deploys it ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)). The workflow needs the `CLOUDFLARE_API_TOKEN` secret and the `CLOUDFLARE_ACCOUNT_ID` variable in the repo settings. To deploy by hand, run `npm run deploy` in `playground/`.

## Architecture

OpenUI Lang's parser, evaluator, and language semantics live entirely in `@openuidev/lang-core`, framework-agnostic — this package only does the Foldkit-specific binding, the same division `vue-lang`/`react-lang` use. Two places this binding differs from the reference renderers, deliberately:

- **No parser instance in the Model.** The reference renderers keep a `StreamParser` around and feed it each chunk incrementally. A Foldkit Model is expected to be plain, comparable, serializable data — not an object with internal mutable buffers — so `reflectResponse` instead calls the plain, non-streaming `createParser(...).parse(text)` on every change. OpenUI Lang's grammar is built to tolerate partial/truncated input by design (`meta.incomplete`), and the spec requires that streaming and one-shot parsing agree at every point, so this is a performance trade (full reparse vs. incremental) rather than a behavioral one.
- **No `@openuidev/lang-core` `Store` instance.** That Store exists to bridge imperative `subscribe`/`notify` state into a host framework's own reactivity. Foldkit's Model *is* the reactivity system, so the binding reimplements the same `$state`/form-field semantics (see [`src/store.ts`](./src/store.ts)) as plain, immutable data on the Model instead of wrapping a second mutable store next to it.

- **An explicit `queryManagerReady` flag, not just `toolProvider !== null`.** `toolProvider` is set (non-null) from `init` on, but the `QueryManager` ManagedResource still has to actually acquire — an async step. The Subscriptions that evaluate queries and bridge the QueryManager's updates gate on `queryManagerReady` (flipped by the `AcquiredQueryManager`/`ReleasedQueryManager` Messages), not on `toolProvider`'s presence; gating on the latter looks right but races the acquisition, since Foldkit Subscriptions only re-run when their *declared dependencies* change; see [`src/subscriptions.ts`](./src/subscriptions.ts).

Parsing, streaming semantics, component rendering, actions, form state, and `Query()`/`Mutation()` are all fully supported. The form-validation composable layer `vue-lang` ships (`createFormValidation`, `builtInValidators`, …) is still out of scope — see [Query() and Mutation()](#query-and-mutation) below for the one Mutation limitation.

## API

| Export | |
| :--- | :--- |
| `defineComponent(config)` | Define a component: name, Zod props schema, description, Foldkit renderer |
| `createLibrary({ components, root? })` | Build a `Library` from an array of defined components |
| `reactive(schema)` | Mark a prop schema as two-way bindable to a `$variable` (see [Two-way bindings](#two-way-bindings)) |
| `init({ library, initialState?, toolProvider? })` | The Submodel's initial `Model` |
| `reflectResponse(model, { response, isStreaming })` | Conform the Model to response text your app owns (see [`Reflect`](https://foldkit.dev)) |
| `update(model, message)` | The Submodel's update function |
| `view` | The Submodel's `SubmodelView`, for `h.submodel` |
| `selectEvaluatedRoot(model)` | The current evaluated root `ElementNode` plus runtime errors |
| `selectErrors(model)` | Every structured, LLM-friendly `OpenUIError` for the current Model (parse + runtime) |
| `renderNode(value, model, h)` / `renderElementNode(node, model, h)` | The recursive renderer, for manual/advanced use |
| `asChildren(renderResult)` | Flattens a `renderNode` result into a children array for a container component |
| `Message`, `OutMessage` | The Submodel's internal Message union and its reported-to-parent OutMessage union |
| `selectIsQueryLoading(model)` | Whether any `Query()` is currently fetching |
| `managedResources` | The `QueryManager` `ManagedResource` — lift with `ManagedResource.lift` into your host |
| `subscriptions` | The Subscriptions that evaluate queries/mutations and bridge the `QueryManager`'s updates — lift with `Subscription.lift` |
| `normalizeToolProvider(input)` | Normalizes an MCP-like client or a tool-name-to-handler map into `@openuidev/lang-core`'s `ToolProvider` shape (`init`'s `toolProvider` option calls this for you) |

Plus re-exports of the `@openuidev/lang-core` pieces you'll touch directly: `createParser`, `evaluate`, `evaluateElementProps`, `BuiltinActionType`, and the `ElementNode`/`ParseResult`/`ActionEvent`/`ActionPlan`/`OpenUIError`/`ToolProvider`/`McpClientLike`/`QuerySnapshot`/`QueryNode`/`MutationNode`/`MutationResult` types.

## License

[MIT](./LICENSE)
