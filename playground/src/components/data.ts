import { z } from 'zod'
import { asChildren, defineComponent, reactive, type ComponentRenderProps } from 'foldkit-openui'
import { children, subProps } from './shared.js'

const Column = z.object({ key: z.string(), label: z.string() })
type Column = z.infer<typeof Column>

interface TableProps {
  rows: unknown[]
  columns?: Column[] | null
  caption?: string
}

export const Table = defineComponent({
  name: 'Table',
  description:
    'A data table, after Nuxt UI Table. `rows` are objects (often a Query() result). `columns` [{key, label}] picks and orders them; without it, every key of the first row shows. A cell may hold a component.',
  props: z.object({
    rows: z.array(z.unknown()).default([]),
    columns: z.array(Column).nullable().optional(),
    caption: z.string().optional(),
  }),
  component: ({ props, h, renderNode }: ComponentRenderProps<TableProps>) => {
    const rows = (props.rows ?? []).filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    const columns: Column[] = props.columns ?? Object.keys(rows[0] ?? {}).map((key) => ({ key, label: key }))
    return h.div([h.Class('nui-table-wrap')], [
      h.table([h.Class('nui-table')], [
        props.caption ? h.caption([], [props.caption]) : h.empty,
        h.thead([], [h.tr([], columns.map((column) => h.keyed('th')(column.key, [h.Scope('col')], [column.label])))]),
        h.tbody(
          [],
          rows.length === 0
            ? [h.tr([], [h.td([h.Colspan(Math.max(1, columns.length)), h.Class('nui-table-empty')], ['No data'])])]
            : rows.map((row, index) =>
                h.keyed('tr')(index, [], columns.map((column) => h.keyed('td')(column.key, [], asChildren(renderNode(row[column.key]))))),
              ),
        ),
      ]),
    ])
  },
})

export const TabItem = defineComponent({
  name: 'TabItem',
  description: 'One tab of a Tabs component: a label and its content.',
  props: z.object({ label: z.string(), children: children() }),
  component: () => null,
})

interface TabsProps {
  name: string
  items: unknown[]
  value?: unknown
}

export const Tabs = defineComponent({
  name: 'Tabs',
  description:
    'Tabbed panels, after Nuxt UI Tabs: Tabs("settings", [TabItem("Profile", [...]), TabItem("Billing", [...])]). Bind `value` to a $variable to read or set the open tab by label.',
  props: z.object({ name: z.string(), items: z.array(TabItem.ref).default([]), value: reactive(z.string().optional()) }),
  component: ({ props, h, renderNode, stateField }: ComponentRenderProps<TabsProps>) => {
    const tabs = (props.items ?? []).flatMap((node) => {
      const tab = subProps<{ label: string; children: unknown[] }>(node)
      return tab ? [tab] : []
    })
    const field = stateField<string>(props.name, props.value, 'Tabs')
    const active = tabs.find((tab) => tab.label === field.value) ?? tabs[0]
    return h.div([h.Class('nui-tabs')], [
      h.div(
        [h.Class('nui-tabs-list'), h.Role('tablist')],
        tabs.map((tab) =>
          h.keyed('button')(tab.label, [
            h.Type('button'),
            h.Role('tab'),
            h.AriaSelected(tab === active),
            h.OnClick(field.setValue(tab.label)),
          ], [tab.label]),
        ),
      ),
      active ? h.div([h.Class('nui-tabs-panel'), h.Role('tabpanel')], asChildren(renderNode(active.children ?? []))) : h.empty,
    ])
  },
})

export const ItemList = defineComponent({
  name: 'ItemList',
  description: 'A plain list of strings, typically a Query() result. Shows "Loading…" while a Query() fetches.',
  props: z.object({ items: z.array(z.string()).default([]) }),
  component: ({ props, h, isQueryLoading }: ComponentRenderProps<{ items: string[] | null | undefined }>) => {
    const items = props.items ?? []
    return h.div([], [
      isQueryLoading ? h.p([h.Class('loading')], ['Loading…']) : h.empty,
      items.length === 0 && !isQueryLoading ? h.p([h.Class('loading')], ['No items yet.']) : h.empty,
      h.ul([], items.map((item, index) => h.keyed('li')(index, [], [item]))),
    ])
  },
})
