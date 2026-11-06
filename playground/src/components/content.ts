import { z } from 'zod'
import { asChildren, defineComponent, type ComponentRenderProps } from 'foldkit-openui'
import { children, color, COLORS, initials, size, subProps, type Color, type Size } from './shared.js'

export const Heading = defineComponent({
  name: 'Heading',
  description: 'A heading. `level` 1–4, default 2.',
  props: z.object({ text: z.string(), level: z.number().default(2) }),
  component: ({ props, h }: ComponentRenderProps<{ text: string; level: number }>) => {
    const level = Math.min(4, Math.max(1, Math.round(props.level)))
    const tag = level === 1 ? h.h1 : level === 2 ? h.h2 : level === 3 ? h.h3 : h.h4
    return tag([h.Class('heading')], [props.text])
  },
})

export const Paragraph = defineComponent({
  name: 'Paragraph',
  description: 'A paragraph of text.',
  props: z.object({ text: z.string() }),
  component: ({ props, h }: ComponentRenderProps<{ text: string }>) => h.p([h.Class('paragraph')], [props.text]),
})

const TONES = ['default', 'muted', ...COLORS] as const

interface TextProps {
  text: string
  tone: (typeof TONES)[number]
  strike: boolean
  bold: boolean
}

export const Text = defineComponent({
  name: 'Text',
  description:
    'Inline text, for use inside a Row. `tone`: default|muted|primary|secondary|success|info|warning|error|neutral. `strike` draws a line through it (a done todo).',
  props: z.object({
    text: z.string(),
    tone: z.enum(TONES).default('default'),
    strike: z.boolean().default(false),
    bold: z.boolean().default(false),
  }),
  component: ({ props, h }: ComponentRenderProps<TextProps>) =>
    h.span(
      [
        h.Class('text'),
        h.DataAttribute('tone', props.tone),
        ...(props.strike ? [h.DataAttribute('strike', 'true')] : []),
        ...(props.bold ? [h.DataAttribute('bold', 'true')] : []),
      ],
      [String(props.text ?? '')],
    ),
})

const BADGE_VARIANTS = ['solid', 'outline', 'soft', 'subtle'] as const

interface BadgeProps {
  label: string
  color: Color
  variant: (typeof BADGE_VARIANTS)[number]
  size: Size
}

export const Badge = defineComponent({
  name: 'Badge',
  description: 'A small status or category label, after Nuxt UI Badge. `variant`: solid|outline|soft|subtle. `size`: xs|sm|md|lg|xl.',
  props: z.object({ label: z.string(), color: color(), variant: z.enum(BADGE_VARIANTS).default('solid'), size: size() }),
  component: ({ props, h }: ComponentRenderProps<BadgeProps>) =>
    h.span(
      [
        h.Class('nui-badge'),
        h.DataAttribute('color', props.color),
        h.DataAttribute('variant', props.variant),
        h.DataAttribute('size', props.size),
      ],
      [String(props.label ?? '')],
    ),
})

const ALERT_VARIANTS = ['solid', 'outline', 'soft', 'subtle'] as const

interface AlertProps {
  title: string
  description?: string
  color: Color
  variant: (typeof ALERT_VARIANTS)[number]
}

export const Alert = defineComponent({
  name: 'Alert',
  description: 'A callout with a title and optional description, after Nuxt UI Alert. `variant`: solid|outline|soft|subtle.',
  props: z.object({
    title: z.string(),
    description: z.string().optional(),
    color: color(),
    variant: z.enum(ALERT_VARIANTS).default('soft'),
  }),
  component: ({ props, h }: ComponentRenderProps<AlertProps>) =>
    h.div([h.Class('nui-alert'), h.Role('alert'), h.DataAttribute('color', props.color), h.DataAttribute('variant', props.variant)], [
      h.strong([], [props.title]),
      props.description ? h.p([], [props.description]) : h.empty,
    ]),
})

interface AvatarProps {
  name: string
  src?: string
  size: Size
}

export const Avatar = defineComponent({
  name: 'Avatar',
  description: 'A round avatar, after Nuxt UI Avatar. Shows `src` if given, else the initials of `name`.',
  props: z.object({ name: z.string(), src: z.string().optional(), size: size() }),
  component: ({ props, h }: ComponentRenderProps<AvatarProps>) =>
    h.span([h.Class('nui-avatar'), h.DataAttribute('size', props.size), h.Title(props.name)], [
      props.src ? h.img([h.Src(props.src), h.Alt(props.name)]) : h.span([h.AriaLabel(props.name)], [initials(props.name)]),
    ]),
})

export const AvatarGroup = defineComponent({
  name: 'AvatarGroup',
  description: 'Overlapping Avatars. Shows the first `max`, then a "+N" count.',
  props: z.object({ children: children(), max: z.number().default(4) }),
  component: ({ props, h, renderNode }: ComponentRenderProps<{ children: unknown[]; max: number }>) => {
    const items = props.children ?? []
    const shown = items.slice(0, props.max)
    const hidden = items.length - shown.length
    return h.div([h.Class('nui-avatar-group')], [
      ...asChildren(renderNode(shown)),
      hidden > 0 ? h.span([h.Class('nui-avatar'), h.DataAttribute('size', 'md')], [h.span([], [`+${hidden}`])]) : h.empty,
    ])
  },
})

interface UserProps {
  name: string
  description?: string
  src?: string
}

export const User = defineComponent({
  name: 'User',
  description: 'An avatar with a name and a description line, after Nuxt UI User.',
  props: z.object({ name: z.string(), description: z.string().optional(), src: z.string().optional() }),
  component: ({ props, h }: ComponentRenderProps<UserProps>) =>
    h.div([h.Class('nui-user')], [
      h.span([h.Class('nui-avatar'), h.DataAttribute('size', 'md')], [
        props.src ? h.img([h.Src(props.src), h.Alt(props.name)]) : h.span([], [initials(props.name)]),
      ]),
      h.span([h.Class('nui-user-text')], [
        h.strong([], [props.name]),
        props.description ? h.small([], [props.description]) : h.empty,
      ]),
    ]),
})

export const Kbd = defineComponent({
  name: 'Kbd',
  description: 'A keyboard key, after Nuxt UI Kbd: Kbd("⌘"), Kbd("K").',
  props: z.object({ value: z.string() }),
  component: ({ props, h }: ComponentRenderProps<{ value: string }>) => h.kbd([h.Class('nui-kbd')], [props.value]),
})

export const Link = defineComponent({
  name: 'Link',
  description: 'A text link that opens in a new tab.',
  props: z.object({ label: z.string(), href: z.string() }),
  component: ({ props, h }: ComponentRenderProps<{ label: string; href: string }>) =>
    h.a([h.Class('nui-link'), h.Href(props.href), h.Target('_blank'), h.Rel('noopener noreferrer')], [props.label]),
})

interface ProgressProps {
  value: number
  max: number
  color: Color
  label?: string
}

export const Progress = defineComponent({
  name: 'Progress',
  description: 'A progress bar, after Nuxt UI Progress. Shows `label` and the percentage above the bar when `label` is given.',
  props: z.object({ value: z.number(), max: z.number().default(100), color: color(), label: z.string().optional() }),
  component: ({ props, h }: ComponentRenderProps<ProgressProps>) => {
    const max = props.max > 0 ? props.max : 100
    const percent = Math.round((Math.min(max, Math.max(0, Number(props.value) || 0)) / max) * 100)
    return h.div([h.Class('nui-progress'), h.DataAttribute('color', props.color)], [
      props.label ? h.div([h.Class('nui-progress-label')], [h.span([], [props.label]), h.span([], [`${percent}%`])]) : h.empty,
      h.div(
        [h.Class('nui-progress-track'), h.Role('progressbar'), h.AriaValuenow(percent), h.AriaValuemin(0), h.AriaValuemax(100)],
        [h.div([h.Class('nui-progress-bar'), h.Style({ width: `${percent}%` })], [])],
      ),
    ])
  },
})

const TimelineEntry = z.object({
  title: z.string(),
  description: z.string().optional(),
  date: z.string().optional(),
  color: z.enum(COLORS).optional(),
})
type TimelineEntry = z.infer<typeof TimelineEntry>

export const Timeline = defineComponent({
  name: 'Timeline',
  description: 'A vertical list of events, after Nuxt UI Timeline. Items: {title, description?, date?, color?}.',
  props: z.object({ items: z.array(TimelineEntry).default([]) }),
  component: ({ props, h }: ComponentRenderProps<{ items: TimelineEntry[] }>) =>
    h.ol(
      [h.Class('nui-timeline')],
      (props.items ?? []).map((item, index) =>
        h.keyed('li')(index, [h.DataAttribute('color', item.color ?? 'primary')], [
          h.span([h.Class('nui-timeline-dot')], []),
          h.div([], [
            item.date ? h.small([], [item.date]) : h.empty,
            h.strong([], [item.title]),
            item.description ? h.p([], [item.description]) : h.empty,
          ]),
        ]),
      ),
    ),
})

export const Stepper = defineComponent({
  name: 'Stepper',
  description: 'Numbered steps with the `current` one (0-based) highlighted and earlier ones done, after Nuxt UI Stepper.',
  props: z.object({ steps: z.array(z.string()).default([]), current: z.number().default(0) }),
  component: ({ props, h }: ComponentRenderProps<{ steps: string[]; current: number }>) =>
    h.ol(
      [h.Class('nui-stepper')],
      (props.steps ?? []).map((step, index) => {
        const state = index < props.current ? 'done' : index === props.current ? 'current' : 'todo'
        return h.keyed('li')(index, [h.DataAttribute('state', state), ...(state === 'current' ? [h.AriaCurrent('step')] : [])], [
          h.span([h.Class('nui-stepper-dot')], [state === 'done' ? '✓' : String(index + 1)]),
          h.span([], [step]),
        ])
      }),
    ),
})

export const Breadcrumb = defineComponent({
  name: 'Breadcrumb',
  description: 'A path of page names; the last one is the current page.',
  props: z.object({ items: z.array(z.string()).default([]) }),
  component: ({ props, h }: ComponentRenderProps<{ items: string[] }>) => {
    const items = props.items ?? []
    return h.nav([h.Class('nui-breadcrumb'), h.AriaLabel('Breadcrumb')], [
      h.ol(
        [],
        items.map((item, index) =>
          h.keyed('li')(index, index === items.length - 1 ? [h.AriaCurrent('page')] : [], [item]),
        ),
      ),
    ])
  },
})

interface AccordionItemProps {
  label: string
  children: unknown[]
  open: boolean
}

export const AccordionItem = defineComponent({
  name: 'AccordionItem',
  description: 'One collapsible section of an Accordion.',
  props: z.object({ label: z.string(), children: children(), open: z.boolean().default(false) }),
  component: () => null,
})

export const Accordion = defineComponent({
  name: 'Accordion',
  description: 'Collapsible sections, after Nuxt UI Accordion: Accordion([AccordionItem("Question", [Paragraph("Answer")])]).',
  props: z.object({ items: z.array(AccordionItem.ref).default([]) }),
  component: ({ props, h, renderNode }: ComponentRenderProps<{ items: unknown[] }>) =>
    h.div(
      [h.Class('nui-accordion')],
      (props.items ?? []).flatMap((node, index) => {
        const item = subProps<AccordionItemProps>(node)
        if (!item) return []
        return [
          h.keyed('details')(index, [h.Open(item.open === true)], [
            h.summary([], [item.label]),
            h.div([h.Class('nui-accordion-body')], asChildren(renderNode(item.children ?? []))),
          ]),
        ]
      }),
    ),
})

interface EmptyProps {
  title: string
  description?: string
  actions: unknown[]
}

export const Empty = defineComponent({
  name: 'Empty',
  description: 'An empty state with a title, optional description, and optional action buttons, after Nuxt UI Empty.',
  props: z.object({ title: z.string(), description: z.string().optional(), actions: children() }),
  component: ({ props, h, renderNode }: ComponentRenderProps<EmptyProps>) =>
    h.div([h.Class('nui-empty')], [
      h.strong([], [props.title]),
      props.description ? h.p([], [props.description]) : h.empty,
      (props.actions ?? []).length > 0 ? h.div([h.Class('row')], asChildren(renderNode(props.actions))) : h.empty,
    ]),
})
