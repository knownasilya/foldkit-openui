import type { ActionPlan } from '@openuidev/lang-core'
import { z } from 'zod'
import type { ActionConfig } from '../message.js'
import { asChildren } from '../render.js'
import { createLibrary, defineComponent, type ComponentRenderProps } from '../library.js'

export const Greeting = defineComponent({
  name: 'Greeting',
  description: 'Displays a greeting message',
  props: z.object({ name: z.string() }),
  component: ({ props, h }: ComponentRenderProps<{ name: string }>) =>
    h.div([h.Class('greeting')], [`Hello, ${props.name}!`]),
})

export const Button = defineComponent({
  name: 'Button',
  description: 'A clickable button that fires an action',
  props: z.object({ label: z.string(), action: z.unknown().optional() }),
  component: ({ props, h, triggerAction }: ComponentRenderProps<{ label: string; action?: unknown }>) =>
    h.button(
      [h.OnClick(triggerAction(props.label, undefined, props.action as ActionConfig | ActionPlan | undefined))],
      [props.label],
    ),
})

export const TextInput = defineComponent({
  name: 'TextInput',
  description: 'A text field bound to a form field',
  props: z.object({ name: z.string() }),
  component: ({ props, h, getFieldValue, setFieldValue }: ComponentRenderProps<{ name: string }>) => {
    const current = getFieldValue(undefined, props.name)
    return h.input([
      h.Name(props.name),
      h.Value(typeof current === 'string' ? current : ''),
      h.OnInput((value) => setFieldValue(undefined, 'TextInput', props.name, value, true)),
    ])
  },
})

export const Card = defineComponent({
  name: 'Card',
  description: 'A titled container',
  props: z.object({ title: z.string(), children: z.array(z.unknown()).default([]) }),
  component: ({ props, h, renderNode }: ComponentRenderProps<{ title: string; children: unknown[] }>) =>
    h.div([h.Class('card')], [h.h2([], [props.title]), ...asChildren(renderNode(props.children))]),
})

export const testLibrary = createLibrary({
  components: [Greeting, Button, TextInput, Card],
})
