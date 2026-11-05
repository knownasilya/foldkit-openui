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
import { Schema } from 'effect'
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

const update = (model: Model, message: Message) =>
  Message.match(message, {
    GotResponseChunk: ({ response, isStreaming }) => ({
      model: { ...model, response, isStreaming, openUI: OpenUI.reflectResponse(model.openUI, { response, isStreaming }) },
    }),
    GotOpenUI: ({ message }) => {
      const result = OpenUI.update(model.openUI, message)
      // result.outMessage, when present, is OpenUI.OutMessage.ActionTriggered({ events })
      // or OpenUI.OutMessage.StateChanged({ state }) — see "Actions and forms" below.
      return { model: { ...model, openUI: result.model } }
    },
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

`triggerAction`/`setFieldValue` **build** Messages — they don't dispatch anything themselves. Bind the result to an event: `h.OnClick(triggerAction(...))`. When `update` handles that Message, it may return an `OutMessage`:

- `OutMessage.ActionTriggered({ events })` — one or more `ActionEvent`s (a legacy `{ type, params }` config, or every `ToAssistant`/`OpenUrl` step from an `ActionPlan`, in order). Continue the conversation, open a URL, etc.
- `OutMessage.StateChanged({ state })` — the form-field store changed and `shouldTriggerSaveCallback` was `true`; persist it alongside the message if you want it restored on reload (pass it back as `OpenUI.init({ library, initialState })`).

Fold the Submodel's update with `Update.foldChild` (or the `GotOpenUI` pattern shown above) to receive `OutMessage` in your own `update`.

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

## Example

[`example/`](./example) is a small Vite + Foldkit app: a text area holds raw OpenUI Lang (standing in for a streaming LLM response), and the right pane re-renders live as you edit it, with fired actions and form-state changes logged below.

```bash
cd example
npm install
npm run dev
```

## Architecture

OpenUI Lang's parser, evaluator, and language semantics live entirely in `@openuidev/lang-core`, framework-agnostic — this package only does the Foldkit-specific binding, the same division `vue-lang`/`react-lang` use. Two places this binding differs from the reference renderers, deliberately:

- **No parser instance in the Model.** The reference renderers keep a `StreamParser` around and feed it each chunk incrementally. A Foldkit Model is expected to be plain, comparable, serializable data — not an object with internal mutable buffers — so `reflectResponse` instead calls the plain, non-streaming `createParser(...).parse(text)` on every change. OpenUI Lang's grammar is built to tolerate partial/truncated input by design (`meta.incomplete`), and the spec requires that streaming and one-shot parsing agree at every point, so this is a performance trade (full reparse vs. incremental) rather than a behavioral one.
- **No `@openuidev/lang-core` `Store` instance.** That Store exists to bridge imperative `subscribe`/`notify` state into a host framework's own reactivity. Foldkit's Model *is* the reactivity system, so the binding reimplements the same `$state`/form-field semantics (see [`src/store.ts`](./src/store.ts)) as plain, immutable data on the Model instead of wrapping a second mutable store next to it.

**Out of scope for now:** `Query()`/`Mutation()` tool-provider wiring (action `run` steps log a warning and are otherwise skipped) and the form-validation composable layer `vue-lang` ships. Parsing, streaming semantics, component rendering, actions, and form state are fully supported.

## API

| Export | |
| :--- | :--- |
| `defineComponent(config)` | Define a component: name, Zod props schema, description, Foldkit renderer |
| `createLibrary({ components, root? })` | Build a `Library` from an array of defined components |
| `init({ library, initialState? })` | The Submodel's initial `Model` |
| `reflectResponse(model, { response, isStreaming })` | Conform the Model to response text your app owns (see [`Reflect`](https://foldkit.dev)) |
| `update(model, message)` | The Submodel's update function |
| `view` | The Submodel's `SubmodelView`, for `h.submodel` |
| `selectEvaluatedRoot(model)` | The current evaluated root `ElementNode` plus runtime errors |
| `selectErrors(model)` | Every structured, LLM-friendly `OpenUIError` for the current Model (parse + runtime) |
| `renderNode(value, model, h)` / `renderElementNode(node, model, h)` | The recursive renderer, for manual/advanced use |
| `asChildren(renderResult)` | Flattens a `renderNode` result into a children array for a container component |
| `Message`, `OutMessage` | The Submodel's internal Message union and its reported-to-parent OutMessage union |

Plus re-exports of the `@openuidev/lang-core` pieces you'll touch directly: `createParser`, `evaluate`, `evaluateElementProps`, `BuiltinActionType`, and the `ElementNode`/`ParseResult`/`ActionEvent`/`ActionPlan`/`OpenUIError` types.

## License

[MIT](./LICENSE)
