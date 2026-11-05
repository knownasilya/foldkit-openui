import { Schema } from 'effect'
import * as OpenUI from 'foldkit-openui'
import { Html, Runtime } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { demoLibrary } from './library.js'

const INITIAL_SOURCE = [
  'header = Heading("Welcome to foldkit-openui")',
  'intro = Paragraph("This text area holds raw OpenUI Lang. Edit it and the preview re-renders immediately — this is what a streaming LLM response would drive, one chunk at a time.")',
  'form = TextField("name", "Your name")',
  'greetBtn = Button("Say hi", {type: "continue_conversation"})',
  'root = Card("Demo", [header, intro, form, greetBtn])',
].join('\n')

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
  return {
    source,
    openUI: OpenUI.reflectResponse(OpenUI.init({ library: demoLibrary }), { response: source, isStreaming: false }),
    log: [],
  }
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

Runtime.run(
  Runtime.makeApplication({
    Model: Schema.Any,
    init: () => ({ model: makeModel(INITIAL_SOURCE) }),
    update,
    view,
    container: document.getElementById('app'),
  }),
)
