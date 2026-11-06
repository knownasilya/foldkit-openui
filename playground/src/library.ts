import { z } from 'zod'
import { asChildren, createLibrary, defineComponent, type ActionConfig, type ActionPlan, type ComponentRenderProps } from 'foldkit-openui'

export const Heading = defineComponent({
  name: 'Heading',
  description: 'A section heading',
  props: z.object({ text: z.string() }),
  component: ({ props, h }: ComponentRenderProps<{ text: string }>) => h.h2([], [props.text]),
})

export const Paragraph = defineComponent({
  name: 'Paragraph',
  description: 'A paragraph of text',
  props: z.object({ text: z.string() }),
  component: ({ props, h }: ComponentRenderProps<{ text: string }>) => h.p([], [props.text]),
})

const NUXT_COLORS = ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'] as const
const NUXT_BUTTON_VARIANTS = ['solid', 'outline', 'soft', 'subtle', 'ghost', 'link'] as const
const NUXT_BADGE_VARIANTS = ['solid', 'outline', 'soft', 'subtle'] as const

interface ButtonProps {
  label: string
  action?: unknown
  color: (typeof NUXT_COLORS)[number]
  variant: (typeof NUXT_BUTTON_VARIANTS)[number]
}

export const Button = defineComponent({
  name: 'Button',
  description:
    'A clickable button, styled after Nuxt UI (https://ui.nuxt.com/components/button). `action` is an Action()/legacy config, fired with the button label as the human-friendly message. `color`: primary|secondary|success|info|warning|error|neutral. `variant`: solid|outline|soft|subtle|ghost|link.',
  props: z.object({
    label: z.string(),
    action: z.unknown().optional(),
    color: z.enum(NUXT_COLORS).default('primary'),
    variant: z.enum(NUXT_BUTTON_VARIANTS).default('solid'),
  }),
  component: ({ props, h, triggerAction }: ComponentRenderProps<ButtonProps>) =>
    h.button(
      [
        h.Class('nui-btn'),
        h.Attribute('data-color', props.color),
        h.Attribute('data-variant', props.variant),
        h.OnClick(triggerAction(props.label, undefined, props.action as ActionConfig | ActionPlan | undefined)),
      ],
      [props.label],
    ),
})

interface BadgeProps {
  label: string
  color: (typeof NUXT_COLORS)[number]
  variant: (typeof NUXT_BADGE_VARIANTS)[number]
}

export const Badge = defineComponent({
  name: 'Badge',
  description:
    'A small status/category label, styled after Nuxt UI (https://ui.nuxt.com/components/badge). `color`: primary|secondary|success|info|warning|error|neutral. `variant`: solid|outline|soft|subtle.',
  props: z.object({
    label: z.string(),
    color: z.enum(NUXT_COLORS).default('primary'),
    variant: z.enum(NUXT_BADGE_VARIANTS).default('solid'),
  }),
  component: ({ props, h }: ComponentRenderProps<BadgeProps>) =>
    h.span([h.Class('nui-badge'), h.Attribute('data-color', props.color), h.Attribute('data-variant', props.variant)], [props.label]),
})

export const TextField = defineComponent({
  name: 'TextField',
  description: 'A labeled text input bound to a form field',
  props: z.object({ name: z.string(), label: z.string() }),
  component: ({ props, h, getFieldValue, setFieldValue }: ComponentRenderProps<{ name: string; label: string }>) => {
    const current = getFieldValue(undefined, props.name)
    return h.label([], [
      `${props.label} `,
      h.input([
        h.Name(props.name),
        h.Value(typeof current === 'string' ? current : ''),
        h.OnInput((value) => setFieldValue(undefined, 'TextField', props.name, value, true)),
      ]),
    ])
  },
})

export const Card = defineComponent({
  name: 'Card',
  description: 'A titled container for other components',
  props: z.object({ title: z.string(), children: z.array(z.unknown()).default([]) }),
  component: ({ props, h, renderNode }: ComponentRenderProps<{ title: string; children: unknown[] }>) =>
    h.div([h.Class('card')], [h.h3([], [props.title]), ...asChildren(renderNode(props.children))]),
})

export const Row = defineComponent({
  name: 'Row',
  description: 'An untitled horizontal flex container, for grouping buttons/badges',
  props: z.object({ children: z.array(z.unknown()).default([]) }),
  component: ({ props, h, renderNode }: ComponentRenderProps<{ children: unknown[] }>) =>
    h.div([h.Class('row')], asChildren(renderNode(props.children))),
})

export const ItemList = defineComponent({
  name: 'ItemList',
  description: 'A list of strings, typically bound to a Query() result',
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

export const playgroundLibrary = createLibrary({
  components: [Heading, Paragraph, Button, Badge, TextField, Card, Row, ItemList],
})
