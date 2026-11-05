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

export const Button = defineComponent({
  name: 'Button',
  description: 'A clickable button. `action` is an Action()/legacy config, fired with the button label as the human-friendly message.',
  props: z.object({ label: z.string(), action: z.unknown().optional() }),
  component: ({ props, h, triggerAction }: ComponentRenderProps<{ label: string; action?: unknown }>) =>
    h.button(
      [h.OnClick(triggerAction(props.label, undefined, props.action as ActionConfig | ActionPlan | undefined))],
      [props.label],
    ),
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

export const demoLibrary = createLibrary({
  components: [Heading, Paragraph, Button, TextField, Card],
})
