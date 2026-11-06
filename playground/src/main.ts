import { Effect, Option, Schema } from 'effect'
import * as OpenUI from 'foldkit-openui'
import { Html, Runtime } from 'foldkit'
import * as Command from 'foldkit/command'
import * as ManagedResource from 'foldkit/managedResource'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import * as Update from 'foldkit/update'
import { tokenizeJson, tokenizeOpenUI, type Token } from './highlight.js'
import { playgroundLibrary } from './library.js'
import { PRESETS } from './presets.js'
import { toolProvider, toolSpecs } from './tools.js'
import * as WebMcp from './webmcp.js'

/** One line of the action log. The body is highlighted as `language`. */
interface LogEntry {
  readonly origin: 'preview' | 'agent'
  readonly label: string
  readonly body: string
  readonly language: 'json' | 'openui'
}

interface Model {
  readonly presetIndex: number
  readonly source: string
  readonly openUI: OpenUI.Model
  readonly log: ReadonlyArray<LogEntry>
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
    tools: [...toolSpecs],
    additionalRules: [
      'This library has no Form, FormControl, or TextContent component. Wrap a control in FormField(label, control) to label it, use Text or Paragraph for text, and bind inputs to $variables that Mutation() args read.',
      '$variables hold only strings, numbers, or booleans. Keep lists in tools: read them with Query() and change them with Mutation().',
      'To act on one item inside @Each, set its id first, then run the mutation and refresh the query: Action([@Set($todoId, t.id), @Run(toggleTodo), @Run(todos)]).',
    ],
    toolExamples: [PRESETS.find((preset) => preset.name === 'Todo list')!.source],
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

const agentEntry = (label: string, patch = ''): LogEntry => ({ origin: 'agent', label: `agent: ${label}`, body: patch, language: 'openui' })

/** The log as plain text lines, for the get_action_log tool. */
const formatLogEntry = (entry: LogEntry) =>
  entry.body ? `${entry.label}${entry.language === 'openui' ? '\n' : ' → '}${entry.body}` : entry.label

/**
 * Starts a new program: clears `$state` and form fields so its declared
 * defaults apply, instead of values left over from the last preset.
 */
function loadProgram(openUI: OpenUI.Model, source: string): OpenUI.Model {
  return OpenUI.reflectResponse({ ...openUI, store: { snapshot: {}, pristineKeys: {} } }, { response: source, isStreaming: false })
}

/** Sets the editor source (as if typed), returning the new Model and the layout report sent back to the agent. */
function applyAgentSource(model: Model, source: string, entry: LogEntry, isNewProgram = false) {
  const openUI = isNewProgram ? loadProgram(model.openUI, source) : OpenUI.reflectResponse(model.openUI, { response: source, isStreaming: false })
  const errors = describeErrors(openUI)
  const nextModel = { ...model, source, openUI, log: [...model.log, entry] }
  return { model: nextModel, result: WebMcp.jsonResult({ source, errors, ok: errors.length === 0 }) }
}

function handleAgentTool(model: Model, tool: WebMcp.ModelTool): { model: Model; result: WebMcp.ToolResult } {
  switch (tool.name) {
    case 'get_layout':
      return { model, result: WebMcp.jsonResult({ source: model.source, errors: describeErrors(model.openUI) }) }
    case 'get_action_log':
      return { model, result: WebMcp.jsonResult(model.log.map(formatLogEntry)) }
    case 'set_layout':
      return applyAgentSource(model, tool.source, agentEntry('set_layout'))
    case 'patch_layout': {
      const merged = model.source.trim() ? OpenUI.mergeStatements(model.source, tool.patch) : tool.patch
      return applyAgentSource(model, merged, agentEntry('patch_layout', tool.patch))
    }
    case 'load_preset': {
      const index = PRESETS.findIndex((preset) => preset.name.toLowerCase() === tool.preset.toLowerCase())
      if (index === -1) {
        return {
          model,
          result: WebMcp.jsonResult({ error: `Unknown preset "${tool.preset}"`, presets: PRESETS.map((p) => p.name) }, true),
        }
      }
      const loaded = applyAgentSource(model, PRESETS[index]!.source, agentEntry(`load_preset("${PRESETS[index]!.name}")`), true)
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

function describeOutMessage(outMessage: OpenUI.OutMessage): LogEntry {
  return OpenUI.OutMessage.match(outMessage, {
    ActionTriggered: ({ events }): LogEntry => ({ origin: 'preview', label: 'ActionTriggered', body: JSON.stringify(events), language: 'json' }),
    StateChanged: ({ state }): LogEntry => ({ origin: 'preview', label: 'StateChanged', body: JSON.stringify(state), language: 'json' }),
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
      return { model: { ...model, presetIndex: index, source, openUI: loadProgram(model.openUI, source), log: [] } }
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

/** Colored spans for highlighted text; plain runs stay bare text nodes. */
const renderTokens = (h: Html.HtmlBuilder<Message>, tokens: ReadonlyArray<Token>) =>
  tokens.map((token) => (token.kind === 'plain' ? token.text : h.span([h.Class(`tok-${token.kind}`)], [token.text])))

// The editor is a transparent textarea stacked on a highlighted <pre> in one
// grid cell. Both use the same font, padding, and wrapping, and neither
// scrolls on its own (the .editor box does), so the colored text always sits
// exactly under the caret. The trailing newline keeps a final empty line tall.
function viewEditor(model: Model, h: Html.HtmlBuilder<Message>) {
  return h.div([h.Class('editor')], [
    h.pre([h.Class('editor-layer editor-highlight'), h.AriaHidden(true)], [...renderTokens(h, tokenizeOpenUI(model.source)), '\n']),
    h.textarea([
      h.Class('editor-layer editor-input'),
      h.AriaLabel('OpenUI Lang source'),
      h.Spellcheck(false),
      h.Autocapitalize('off'),
      h.Autocomplete('off'),
      h.OnInput((value) => Message.EditedSource({ value })),
      h.Value(model.source),
    ]),
  ])
}

// Newest entries render first inside a column-reverse box, so they read top
// to bottom in order and the box stays scrolled to the latest one.
function viewLog(model: Model, h: Html.HtmlBuilder<Message>) {
  if (model.log.length === 0) return h.div([h.Class('log')], [h.span([h.Class('log-empty')], ['(no actions fired yet)'])])
  return h.div(
    [h.Class('log')],
    model.log
      .map((entry, index) =>
        h.keyed('div')(index, [h.Class('log-entry'), h.DataAttribute('origin', entry.origin)], [
          h.span([h.Class('log-label')], [entry.label]),
          entry.body
            ? h.code(
                [h.Class('log-body'), h.DataAttribute('language', entry.language)],
                renderTokens(h, entry.language === 'json' ? tokenizeJson(entry.body) : tokenizeOpenUI(entry.body)),
              )
            : h.empty,
        ]),
      )
      .reverse(),
  )
}

const componentCount = Object.keys(playgroundLibrary.components).length

function view(model: Model, h: Html.HtmlBuilder<Message>) {
  return {
    title: 'foldkit-openui playground',
    body: h.div([h.Class('app')], [
      h.header([], [
        h.div([h.Class('title')], [
          h.span([h.Class('logo')], ['foldkit-openui']),
          h.span([h.Class('tagline')], [`Foldkit bindings for OpenUI Lang — playground · ${componentCount} Nuxt UI-style components`]),
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
        h.div([h.Class('pane')], [h.h1([], ['OpenUI Lang source']), viewEditor(model, h)]),
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
          viewLog(model, h),
        ]),
      ]),
    ]),
  }
}

// Lift the OpenUI Submodel's ManagedResource (the live QueryManager) and
// Subscription (bridging its updates into Messages) into this app's own
// config — required for the Query()/Mutation() presets, harmless otherwise.
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

// Firefox only starts a native drag when dragstart puts some data on the
// DataTransfer, and Foldkit's OnDragStart does not. This adds an empty
// payload for the playground's draggable cards; the drag's meaning travels
// in the card's dragAction, not in this data.
document.addEventListener(
  'dragstart',
  (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-draggable]') : null
    if (!target || !event.dataTransfer) return
    event.dataTransfer.effectAllowed = 'move'
    if (event.dataTransfer.types.length === 0) event.dataTransfer.setData('text/plain', '')
  },
  true,
)

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
