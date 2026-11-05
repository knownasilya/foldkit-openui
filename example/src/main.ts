import { Option, Schema } from 'effect'
import * as OpenUI from 'foldkit-openui'
import { Html, Runtime } from 'foldkit'
import * as ManagedResource from 'foldkit/managedResource'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { demoLibrary } from './library.js'

const INITIAL_SOURCE = [
  'header = Heading("Welcome to foldkit-openui")',
  'intro = Paragraph("This text area holds raw OpenUI Lang. Edit it and the preview re-renders immediately — this is what a streaming LLM response would drive, one chunk at a time.")',
  'form = TextField("name", "Your name")',
  'greetBtn = Button("Say hi", {type: "continue_conversation"})',
  'items = Query("get_items", {})',
  'itemsList = ItemList(items)',
  'root = Card("Demo", [header, intro, form, greetBtn, itemsList])',
].join('\n')

// A mock tool provider standing in for a real backend/MCP server, so the
// Query() statement above has something to call.
const toolProvider = {
  async get_items(): Promise<string[]> {
    await new Promise((resolve) => setTimeout(resolve, 600))
    return ['Apple', 'Banana', 'Cherry']
  },
}

interface Model {
  readonly source: string
  readonly openUI: OpenUI.Model
  readonly log: ReadonlyArray<string>
}

const Message = defineMessageUnion({
  EditedSource: { value: Schema.String },
  GotOpenUI: { message: Schema.Any },
})
type Message = typeof Message.Type

function makeModel(source: string): Model {
  const openUI = OpenUI.reflectResponse(OpenUI.init({ library: demoLibrary, toolProvider }), {
    response: source,
    isStreaming: false,
  })
  return { source, openUI, log: [] }
}

function describeOutMessage(outMessage: OpenUI.OutMessage): string {
  return OpenUI.OutMessage.match(outMessage, {
    ActionTriggered: ({ events }) => `ActionTriggered: ${JSON.stringify(events)}`,
    StateChanged: ({ state }) => `StateChanged: ${JSON.stringify(state)}`,
  })
}

function update(model: Model, message: Message) {
  return Message.match(message, {
    EditedSource: ({ value }) => {
      const openUI = OpenUI.reflectResponse(model.openUI, { response: value, isStreaming: false })
      return { model: { ...model, source: value, openUI } }
    },
    GotOpenUI: ({ message }) => {
      const result = OpenUI.update(model.openUI, message as OpenUI.Message)
      const log = result.outMessage ? [...model.log, describeOutMessage(result.outMessage)] : model.log
      return { model: { ...model, openUI: result.model, log } }
    },
  })
}

function view(model: Model, h: Html.HtmlBuilder<Message>) {
  return {
    title: 'foldkit-openui example',
    body: h.div([], [
      h.div([h.Class('pane')], [
        h.h1([], ['OpenUI Lang source']),
        h.textarea([h.OnInput((value) => Message.EditedSource({ value })), h.Value(model.source)]),
      ]),
      h.div([h.Class('pane')], [
        h.h1([], ['Rendered preview']),
        h.submodel({
          slotId: 'demo-openui',
          model: model.openUI,
          view: OpenUI.view,
          toParentMessage: (message) => Message.GotOpenUI({ message }),
        }),
        h.div([h.Class('log')], [model.log.length === 0 ? '(no actions fired yet)' : model.log.join('\n')]),
      ]),
    ]),
  }
}

// Lift the OpenUI Submodel's ManagedResource (the live QueryManager) and
// Subscription (bridging its updates into Messages) into this app's own
// config — required for Query()/Mutation() support, optional otherwise.
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
    init: () => ({ model: makeModel(INITIAL_SOURCE) }),
    update,
    view,
    managedResources,
    subscriptions,
    container: document.getElementById('app'),
  }),
)
