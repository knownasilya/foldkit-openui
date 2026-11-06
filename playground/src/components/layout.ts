import { z } from 'zod'
import { asChildren, defineComponent, type ComponentRenderProps } from 'foldkit-openui'
import { action, asAction, children } from './shared.js'

const GAPS = ['xs', 'sm', 'md', 'lg'] as const
type Gap = (typeof GAPS)[number]

interface StackProps {
  children: unknown[]
  gap: Gap
}

export const Stack = defineComponent({
  name: 'Stack',
  description: 'Vertical layout. The usual root. `gap`: xs|sm|md|lg.',
  props: z.object({ children: children(), gap: z.enum(GAPS).default('md') }),
  component: ({ props, h, renderNode }: ComponentRenderProps<StackProps>) =>
    h.div([h.Class('stack'), h.DataAttribute('gap', props.gap)], asChildren(renderNode(props.children))),
})

const JUSTIFY = ['start', 'center', 'end', 'between'] as const

interface RowProps {
  children: unknown[]
  justify: (typeof JUSTIFY)[number]
  gap: Gap
}

export const Row = defineComponent({
  name: 'Row',
  description: 'Horizontal layout that wraps. Use for buttons, badges, or a list item. `justify`: start|center|end|between.',
  props: z.object({ children: children(), justify: z.enum(JUSTIFY).default('start'), gap: z.enum(GAPS).default('sm') }),
  component: ({ props, h, renderNode }: ComponentRenderProps<RowProps>) =>
    h.div(
      [h.Class('row'), h.DataAttribute('justify', props.justify), h.DataAttribute('gap', props.gap)],
      asChildren(renderNode(props.children)),
    ),
})

export const Grid = defineComponent({
  name: 'Grid',
  description: 'Equal-width columns, for stat cards or board columns. Collapses to one column on narrow screens.',
  props: z.object({ children: children(), columns: z.number().default(2) }),
  component: ({ props, h, renderNode }: ComponentRenderProps<{ children: unknown[]; columns: number }>) =>
    h.div(
      [h.Class('grid'), h.Style({ '--cols': String(Math.max(1, Math.round(props.columns))) })],
      asChildren(renderNode(props.children)),
    ),
})

const CARD_VARIANTS = ['outline', 'soft', 'subtle', 'solid'] as const

interface CardProps {
  title: string
  children: unknown[]
  variant: (typeof CARD_VARIANTS)[number]
  dragAction?: unknown
  dropAction?: unknown
}

export const Card = defineComponent({
  name: 'Card',
  description:
    'A container, after Nuxt UI Card. `title` may be "" for none. `variant`: outline|soft|subtle|solid. `dragAction` makes the card draggable and runs when a drag starts; `dropAction` makes it a drop target and runs on drop (use both for a kanban board).',
  props: z.object({
    title: z.string(),
    children: children(),
    variant: z.enum(CARD_VARIANTS).default('outline'),
    dragAction: action(),
    dropAction: action(),
  }),
  component: ({ props, h, renderNode, triggerAction }: ComponentRenderProps<CardProps>) => {
    const dragAction = asAction(props.dragAction)
    const dropAction = asAction(props.dropAction)
    return h.div(
      [
        h.Class('card'),
        h.DataAttribute('variant', props.variant),
        ...(dragAction
          ? [h.Draggable(true), h.DataAttribute('draggable', 'true'), h.OnDragStart(triggerAction(props.title, undefined, dragAction))]
          : []),
        ...(dropAction ? [h.AllowDrop(), h.DataAttribute('droppable', 'true'), h.OnDrop(triggerAction(props.title, undefined, dropAction))] : []),
      ],
      [props.title ? h.h3([], [props.title]) : h.empty, ...asChildren(renderNode(props.children))],
    )
  },
})

export const Separator = defineComponent({
  name: 'Separator',
  description: 'A horizontal divider, with an optional centered label.',
  props: z.object({ label: z.string().optional() }),
  component: ({ props, h }: ComponentRenderProps<{ label?: string }>) =>
    props.label
      ? h.div([h.Class('separator'), h.Role('separator')], [h.span([], [props.label])])
      : h.hr([h.Class('separator')]),
})
