// A mock backend for the Query()/Mutation() presets, standing in for a real
// API or MCP server. Data lives in this module, not the Model, the same way a
// server's would: the UI only sees it through tool calls. Each tool carries
// the spec the language reference shows an agent, next to its handler.

interface ToolSpec {
  readonly name: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>
  readonly outputSchema: Record<string, unknown>
  readonly annotations?: { readonly readOnlyHint?: boolean }
}

interface MockTool extends ToolSpec {
  readonly run: (args: Record<string, unknown>) => Promise<unknown>
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const noArgs = { type: 'object', properties: {} }
const okResult = { type: 'object', properties: { ok: { type: 'boolean' } } }
const text = (args: Record<string, unknown>, key: string) => (typeof args[key] === 'string' ? (args[key] as string).trim() : '')

// ─── Items (the Query & Mutation preset) ──────────────────────────────────────

const adjectives = ['Shiny', 'Rusty', 'Velvet', 'Cosmic', 'Tiny', 'Giant', 'Quiet', 'Electric']
const nouns = ['Teapot', 'Compass', 'Lantern', 'Satellite', 'Pretzel', 'Umbrella', 'Kazoo', 'Anchor']
const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]!
let items = ['Apple', 'Banana', 'Cherry']

// ─── Todos ────────────────────────────────────────────────────────────────────

interface Todo {
  readonly id: string
  readonly title: string
  readonly done: boolean
}

let todos: Todo[] = [
  { id: 't1', title: 'Read the OpenUI Lang docs', done: true },
  { id: 't2', title: 'Point a WebMCP agent at this page', done: false },
  { id: 't3', title: 'Drag a card across the kanban board', done: false },
]
let nextTodo = 4

function todoList(filter: unknown) {
  const shown = filter === 'active' ? todos.filter((todo) => !todo.done) : filter === 'done' ? todos.filter((todo) => todo.done) : todos
  const remaining = todos.filter((todo) => !todo.done).length
  return { todos: shown, remaining, done: todos.length - remaining, total: todos.length }
}

const TodoSchema = {
  type: 'object',
  properties: { id: { type: 'string' }, title: { type: 'string' }, done: { type: 'boolean' } },
}

// ─── Kanban ───────────────────────────────────────────────────────────────────

const STATUSES = ['todo', 'doing', 'done'] as const
type Status = (typeof STATUSES)[number]

interface KanbanCard {
  readonly id: string
  readonly title: string
  readonly status: Status
  readonly tag: string
  readonly assignee: string
}

let cards: KanbanCard[] = [
  { id: 'c1', title: 'Sketch the onboarding flow', status: 'done', tag: 'design', assignee: 'Grace Hopper' },
  { id: 'c2', title: 'Wire the board to a real API', status: 'doing', tag: 'backend', assignee: 'Ada Lovelace' },
  { id: 'c3', title: 'Write release notes', status: 'todo', tag: 'docs', assignee: 'Alan Turing' },
  { id: 'c4', title: 'Add keyboard shortcuts', status: 'todo', tag: 'frontend', assignee: 'Katherine Johnson' },
  { id: 'c5', title: 'Load-test the WebSocket server', status: 'doing', tag: 'backend', assignee: 'Linus Torvalds' },
]
let nextCard = 6
const tags = ['design', 'frontend', 'backend', 'docs']
const people = ['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Katherine Johnson', 'Linus Torvalds']

const CardSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'string', enum: STATUSES },
    tag: { type: 'string' },
    assignee: { type: 'string' },
  },
}

// ─── Tools ────────────────────────────────────────────────────────────────────

export const MOCK_TOOLS: readonly MockTool[] = [
  {
    name: 'get_items',
    description: 'Returns the current list of items (strings).',
    inputSchema: noArgs,
    outputSchema: { type: 'array', items: { type: 'string' } },
    annotations: { readOnlyHint: true },
    run: async () => (await wait(400), [...items]),
  },
  {
    name: 'add_item',
    description: 'Appends a random item to the list and returns it.',
    inputSchema: noArgs,
    outputSchema: { type: 'object', properties: { item: { type: 'string' } } },
    run: async () => {
      await wait(400)
      const item = `${pick(adjectives)} ${pick(nouns)}`
      items = [...items, item]
      return { item }
    },
  },
  {
    name: 'list_todos',
    description: 'Lists todos. `filter`: "all" (default), "active", or "done". Counts always cover every todo.',
    inputSchema: { type: 'object', properties: { filter: { type: 'string', enum: ['all', 'active', 'done'] } } },
    outputSchema: {
      type: 'object',
      properties: {
        todos: { type: 'array', items: TodoSchema },
        remaining: { type: 'number' },
        done: { type: 'number' },
        total: { type: 'number' },
      },
    },
    annotations: { readOnlyHint: true },
    run: async (args) => (await wait(120), todoList(args.filter)),
  },
  {
    name: 'add_todo',
    description: 'Adds a todo with the given title. Ignores an empty title.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    outputSchema: { type: 'object', properties: { todo: TodoSchema } },
    run: async (args) => {
      await wait(120)
      const title = text(args, 'title')
      if (!title) return { todo: null }
      const todo: Todo = { id: `t${nextTodo++}`, title, done: false }
      todos = [...todos, todo]
      return { todo }
    },
  },
  {
    name: 'toggle_todo',
    description: 'Flips a todo between done and not done.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    outputSchema: okResult,
    run: async (args) => {
      await wait(120)
      todos = todos.map((todo) => (todo.id === args.id ? { ...todo, done: !todo.done } : todo))
      return { ok: true }
    },
  },
  {
    name: 'delete_todo',
    description: 'Deletes a todo.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    outputSchema: okResult,
    run: async (args) => {
      await wait(120)
      todos = todos.filter((todo) => todo.id !== args.id)
      return { ok: true }
    },
  },
  {
    name: 'clear_completed',
    description: 'Deletes every done todo.',
    inputSchema: noArgs,
    outputSchema: okResult,
    run: async () => {
      await wait(120)
      todos = todos.filter((todo) => !todo.done)
      return { ok: true }
    },
  },
  {
    name: 'get_board',
    description: 'Returns every kanban card. `status` is "todo", "doing", or "done".',
    inputSchema: noArgs,
    outputSchema: { type: 'object', properties: { cards: { type: 'array', items: CardSchema } } },
    annotations: { readOnlyHint: true },
    run: async () => (await wait(120), { cards }),
  },
  {
    name: 'add_card',
    description: 'Adds a card to the "todo" column with a random tag and assignee. Ignores an empty title.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    outputSchema: { type: 'object', properties: { card: CardSchema } },
    run: async (args) => {
      await wait(120)
      const title = text(args, 'title')
      if (!title) return { card: null }
      const card: KanbanCard = { id: `c${nextCard++}`, title, status: 'todo', tag: pick(tags), assignee: pick(people) }
      cards = [...cards, card]
      return { card }
    },
  },
  {
    name: 'move_card',
    description: 'Moves a card to another column. Moving a card to the end of its own column also works.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, status: { type: 'string', enum: STATUSES } },
      required: ['id', 'status'],
    },
    outputSchema: okResult,
    run: async (args) => {
      await wait(120)
      const status = STATUSES.find((value) => value === args.status)
      const card = cards.find((entry) => entry.id === args.id)
      if (!status || !card) return { ok: false }
      cards = [...cards.filter((entry) => entry.id !== card.id), { ...card, status }]
      return { ok: true }
    },
  },
  {
    name: 'delete_card',
    description: 'Deletes a card.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    outputSchema: okResult,
    run: async (args) => {
      await wait(120)
      cards = cards.filter((card) => card.id !== args.id)
      return { ok: true }
    },
  },
]

/** The tool map `OpenUI.init` takes. */
export const toolProvider = Object.fromEntries(MOCK_TOOLS.map((tool) => [tool.name, tool.run]))

/** The tool descriptions the language reference shows an agent. */
export const toolSpecs: readonly ToolSpec[] = MOCK_TOOLS.map(({ run: _run, ...spec }) => spec)
