export interface Preset {
  readonly name: string
  readonly description: string
  readonly source: string
}

export const PRESETS: readonly Preset[] = [
  {
    name: 'Basics',
    description: 'Static components, no state',
    source: [
      'root = Card("Welcome", [header, intro, badges])',
      'header = Heading("Welcome to foldkit-openui")',
      'intro = Paragraph("Edit this OpenUI Lang source on the left — the preview updates live, the same way a streaming LLM response would drive it. Components below are styled after Nuxt UI.")',
      'badges = Row([b1, b2, b3, b4])',
      'b1 = Badge("primary / solid", "primary", "solid")',
      'b2 = Badge("success / soft", "success", "soft")',
      'b3 = Badge("warning / subtle", "warning", "subtle")',
      'b4 = Badge("error / outline", "error", "outline")',
    ].join('\n'),
  },
  {
    name: 'Forms & Actions',
    description: 'Form fields, Action(), and button variants',
    source: [
      'root = Card("Say hello", [intro, nameField, buttons])',
      'intro = Paragraph("Type your name, then click a button to fire an Action() — watch the log on the right.")',
      'nameField = TextField("name", "Your name")',
      'buttons = Row([greetBtn, dangerBtn, ghostBtn])',
      'greetBtn = Button("Say hi", Action([@ToAssistant("Hello there!")]), "success", "solid")',
      'dangerBtn = Button("Remove", Action([@ToAssistant("Removed!")]), "error", "outline")',
      'ghostBtn = Button("Learn more", Action([@OpenUrl("https://github.com/knownasilya/foldkit-openui")]), "neutral", "ghost")',
    ].join('\n'),
  },
  {
    name: 'Query & Mutation',
    description: 'A live Query() plus a Mutation() wired to a button',
    source: [
      'root = Card("Live items (Query + Mutation)", [intro, itemsList, addBtn])',
      'intro = Paragraph("items comes from a mocked Query(); clicking the button fires a Mutation() then re-runs the Query().")',
      'items = Query("get_items", {})',
      'itemsList = ItemList(items)',
      'newItem = Mutation("add_item", {})',
      'addBtn = Button("Add random item", Action([@Run(newItem), @Run(items)]), "primary", "solid")',
    ].join('\n'),
  },
]
