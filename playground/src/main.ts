import { Effect, Option, Schema } from 'effect'
import * as OpenUI from 'foldkit-openui'
import { Html, Runtime } from 'foldkit'
import * as Command from 'foldkit/command'
import * as ManagedResource from 'foldkit/managedResource'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import * as Update from 'foldkit/update'
import { playgroundLibrary } from './library.js'
import { PRESETS } from './presets.js'
import * as WebMcp from './webmcp.js'

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
  readonly webMcpAvailable: boolean
}

const Message = defineMessageUnion({
  SelectedPreset: { index: Schema.Number },
  EditedSource: { value: Schema.String },
  GotOpenUI: { message: Schema.Any },
  /** An AI agent called one of the playground's WebMCP tools (see webmcp.ts). */
  CalledAgentTool: { call: Schema.Any },
  RepliedToAgent: {},
})
type Message = typeof Message.Type

// The system prompt an agent reads (via the get_openui_lang_reference tool)
// before writing a layout. `editMode` documents the statement-merge rules
// patch_layout relies on; `tools` documents the mock Query()/Mutation() tools.
const languageReference = () =>
  playgroundLibrary.prompt({
    editMode: true,
    tools: [
      {
        name: 'get_items',
        description: 'Returns the current list of items (strings).',
        inputSchema: { type: 'object', properties: {} },
        outputSchema: { type: 'array', items: { type: 'string' } },
        annotations: { readOnlyHint: true },
      },
      {
        name: 'add_item',
        description: 'Appends a random item to the list and returns it.',
        inputSchema: { type: 'object', properties: {} },
        outputSchema: { type: 'object', properties: { item: { type: 'string' } } },
      },
    ],
  })

/** Hands a tool result back to the waiting agent — a side effect, so it runs as a Command, not inside `update`. */
const ReplyToAgent = Command.define('ReplyToAgent', {
  args: { reply: Schema.Any, result: Schema.Any },
  messages: [Message.RepliedToAgent],
  execute: ({ reply, result }) =>
    Effect.sync(() => {
      ;(reply as WebMcp.ToolCall['reply'])(result as WebMcp.ToolResult)
      return Message.RepliedToAgent()
    }),
})

function describeErrors(openUI: OpenUI.Model) {
  return OpenUI.selectErrors(openUI).map(({ source, code, message, statementId, component, path }) => ({
    source,
    code,
    message,
    ...(statementId ? { statementId } : {}),
    ...(component ? { component } : {}),
    ...(path ? { path } : {}),
  }))
}

/** Sets the editor source (as if typed), returning the new Model and the layout report sent back to the agent. */
function applyAgentSource(model: Model, source: string, logLine: string) {
  const openUI = OpenUI.reflectResponse(model.openUI, { response: source, isStreaming: false })
  const errors = describeErrors(openUI)
  const nextModel = { ...model, source, openUI, log: [...model.log, logLine] }
  return { model: nextModel, result: WebMcp.jsonResult({ source, errors, ok: errors.length === 0 }) }
}

function handleAgentTool(model: Model, tool: WebMcp.ModelTool): { model: Model; result: WebMcp.ToolResult } {
  switch (tool.name) {
    case 'get_layout':
      return { model, result: WebMcp.jsonResult({ source: model.source, errors: describeErrors(model.openUI) }) }
    case 'get_action_log':
      return { model, result: WebMcp.jsonResult(model.log) }
    case 'set_layout':
      return applyAgentSource(model, tool.source, '🤖 agent → set_layout')
    case 'patch_layout': {
      const merged = model.source.trim() ? OpenUI.mergeStatements(model.source, tool.patch) : tool.patch
      return applyAgentSource(model, merged, `🤖 agent → patch_layout\n${tool.patch}`)
    }
    case 'load_preset': {
      const index = PRESETS.findIndex((preset) => preset.name.toLowerCase() === tool.preset.toLowerCase())
      if (index === -1) {
        return {
          model,
          result: WebMcp.jsonResult({ error: `Unknown preset "${tool.preset}"`, presets: PRESETS.map((p) => p.name) }, true),
        }
      }
      const loaded = applyAgentSource(model, PRESETS[index]!.source, `🤖 agent → load_preset("${PRESETS[index]!.name}")`)
      return { ...loaded, model: { ...loaded.model, presetIndex: index } }
    }
  }
}

function makeOpenUIModel(source: string): OpenUI.Model {
  return OpenUI.reflectResponse(OpenUI.init({ library: playgroundLibrary, toolProvider }), {
    response: source,
    isStreaming: false,
  })
}

function initialModel(): Model {
  const presetIndex = 0
  const source = PRESETS[presetIndex]!.source
  return { presetIndex, source, openUI: makeOpenUIModel(source), log: [], webMcpAvailable: WebMcp.isWebMcpAvailable() }
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
    CalledAgentTool: ({ call }) => {
      const { tool, reply } = call as WebMcp.ToolCall
      const handled = handleAgentTool(model, tool)
      return { model: handled.model, commands: [ReplyToAgent({ reply, result: handled.result })] }
    },
    RepliedToAgent: () => ({ model }),
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
          h.span(
            [
              h.Class(model.webMcpAvailable ? 'webmcp on' : 'webmcp'),
              h.Attribute(
                'title',
                model.webMcpAvailable
                  ? 'This page exposes WebMCP tools (navigator.modelContext): an in-browser AI agent can read the component library and build a layout here.'
                  : 'WebMCP (navigator.modelContext) is not available in this browser. Use a browser with WebMCP enabled, or a WebMCP extension, to let an AI agent build layouts here.',
              ),
            ],
            [model.webMcpAvailable ? '● WebMCP tools active' : '○ WebMCP unavailable'],
          ),
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

const openUISubscriptions = Subscription.lift(OpenUI.subscriptions)<Model, Message>({
  read: (model) => Option.some(model.openUI),
  toParentMessage: (message) => Message.GotOpenUI({ message }),
})

// Registers the WebMCP tools once for the app's lifetime; each Model-dependent
// call arrives as a CalledAgentTool Message.
const webMcpSubscriptions = Subscription.make<Model, Message>()(() => ({
  webMcpTools: Subscription.persistentEntry(
    WebMcp.toolCalls({ languageReference, presets: PRESETS }, (call) => Message.CalledAgentTool({ call })),
  ),
}))

const subscriptions = Subscription.aggregate(openUISubscriptions, webMcpSubscriptions)

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
