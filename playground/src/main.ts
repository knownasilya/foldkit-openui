import { Option, Schema } from 'effect'
import * as OpenUI from 'foldkit-openui'
import { Html, Runtime } from 'foldkit'
import * as ManagedResource from 'foldkit/managedResource'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import * as Update from 'foldkit/update'
import { playgroundLibrary } from './library.js'
import { PRESETS } from './presets.js'

// A mock tool provider standing in for a real backend/MCP server, so the
// Query()/Mutation() demo preset has something to call. State lives in this
// closure, not the Model, the same way a real server's data would.
const adjectives = ['Shiny', 'Rusty', 'Velvet', 'Cosmic', 'Tiny', 'Giant', 'Quiet', 'Electric']
const nouns = ['Teapot', 'Compass', 'Lantern', 'Satellite', 'Pretzel', 'Umbrella', 'Kazoo', 'Anchor']
let items = ['Apple', 'Banana', 'Cherry']

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const toolProvider = {
  async get_items(): Promise<string[]> {
    await delay(400)
    return [...items]
  },
  async add_item(): Promise<{ item: string }> {
    await delay(400)
    const item = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`
    items = [...items, item]
    return { item }
  },
}

interface Model {
  readonly presetIndex: number
  readonly source: string
  readonly openUI: OpenUI.Model
  readonly log: ReadonlyArray<string>
}

const Message = defineMessageUnion({
  SelectedPreset: { index: Schema.Number },
  EditedSource: { value: Schema.String },
  GotOpenUI: { message: Schema.Any },
})
type Message = typeof Message.Type

function makeOpenUIModel(source: string): OpenUI.Model {
  return OpenUI.reflectResponse(OpenUI.init({ library: playgroundLibrary, toolProvider }), {
    response: source,
    isStreaming: false,
  })
}

function initialModel(): Model {
  const presetIndex = 0
  const source = PRESETS[presetIndex]!.source
  return { presetIndex, source, openUI: makeOpenUIModel(source), log: [] }
}

function describeOutMessage(outMessage: OpenUI.OutMessage): string {
  return OpenUI.OutMessage.match(outMessage, {
    ActionTriggered: ({ events }) => `ActionTriggered → ${JSON.stringify(events)}`,
    StateChanged: ({ state }) => `StateChanged → ${JSON.stringify(state)}`,
  })
}

// Folding the submodel's update through `Update.foldChild` — rather than
// calling `OpenUI.update` directly and only copying back its `model` — is
// required, not optional: a plain call silently drops the Commands a
// TriggeredAction can return (FireMutation/InvalidateQuery/RunSteps), so a
// button wired to a Mutation()/Query() `@Run` step would appear to do
// nothing. foldChild lifts those Commands into this app's own batch.
const foldOpenUI = Update.foldChild({
  update: OpenUI.update,
  read: (model: Model) => Option.some(model.openUI),
  write: (model: Model, openUI: OpenUI.Model) => ({ ...model, openUI }),
  toParentMessage: (message: OpenUI.Message): Message => Message.GotOpenUI({ message }),
  foldOutMessage: (outMessage: OpenUI.OutMessage) => (model: Model) => ({
    model: { ...model, log: [...model.log, describeOutMessage(outMessage)] },
  }),
})

function update(model: Model, message: Message) {
  return Message.match(message, {
    SelectedPreset: ({ index }) => {
      const source = PRESETS[index]?.source ?? model.source
      const openUI = OpenUI.reflectResponse(model.openUI, { response: source, isStreaming: false })
      return { model: { ...model, presetIndex: index, source, openUI, log: [] } }
    },
    EditedSource: ({ value }) => {
      const openUI = OpenUI.reflectResponse(model.openUI, { response: value, isStreaming: false })
      return { model: { ...model, source: value, openUI } }
    },
    GotOpenUI: ({ message }) => foldOpenUI(model, message as OpenUI.Message),
  })
}

function view(model: Model, h: Html.HtmlBuilder<Message>) {
  return {
    title: 'foldkit-openui playground',
    body: h.div([h.Class('app')], [
      h.header([], [
        h.div([h.Class('title')], [
          h.span([h.Class('logo')], ['foldkit-openui']),
          h.span([h.Class('tagline')], ['Foldkit bindings for OpenUI Lang — playground']),
        ]),
        h.nav([], [
          h.a([h.Attribute('href', 'https://github.com/knownasilya/foldkit-openui'), h.Attribute('target', '_blank')], ['GitHub']),
          h.a([h.Attribute('href', 'https://www.npmjs.com/package/foldkit-openui'), h.Attribute('target', '_blank')], ['npm']),
        ]),
      ]),
      h.div([h.Class('presets')], PRESETS.map((preset, index) =>
        h.keyed('button')(index, [
          h.Class(index === model.presetIndex ? 'preset active' : 'preset'),
          h.OnClick(Message.SelectedPreset({ index })),
          h.Attribute('title', preset.description),
        ], [preset.name]),
      )),
      h.div([h.Class('panes')], [
        h.div([h.Class('pane')], [
          h.h1([], ['OpenUI Lang source']),
          h.textarea([h.OnInput((value) => Message.EditedSource({ value })), h.Value(model.source)]),
        ]),
        h.div([h.Class('pane')], [
          h.h1([], ['Rendered output']),
          h.div([h.Class('preview')], [
            h.submodel({
              slotId: 'playground-openui',
              model: model.openUI,
              view: OpenUI.view,
              toParentMessage: (message) => Message.GotOpenUI({ message }),
            }),
          ]),
          h.h1([], ['Action log']),
          h.div([h.Class('log')], [model.log.length === 0 ? '(no actions fired yet)' : model.log.join('\n')]),
        ]),
      ]),
    ]),
  }
}

// Lift the OpenUI Submodel's ManagedResource (the live QueryManager) and
// Subscription (bridging its updates into Messages) into this app's own
// config — required for the Query & Mutation preset, harmless otherwise.
const managedResources = ManagedResource.lift(OpenUI.managedResources)<Model, Message>({
  read: (model) => Option.some(model.openUI),
  toParentMessage: (message) => Message.GotOpenUI({ message }),
})

const subscriptions = Subscription.lift(OpenUI.subscriptions)<Model, Message>({
  read: (model) => Option.some(model.openUI),
  toParentMessage: (message) => Message.GotOpenUI({ message }),
})

Runtime.run(
  Runtime.makeApplication({
    Model: Schema.Any,
    init: () => ({ model: initialModel() }),
    update,
    view,
    managedResources,
    subscriptions,
    container: document.getElementById('app'),
  }),
)
