import type { ActionPlan } from '@openuidev/lang-core'
import { z } from 'zod'
import type { ActionConfig } from '../message.js'
import { asChildren } from '../render.js'
import { createLibrary, defineComponent, reactive, type ComponentRenderProps } from '../library.js'

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

export const BoundInput = defineComponent({
  name: 'BoundInput',
  description: 'A text input with a two-way $binding',
  props: z.object({ name: z.string(), value: reactive(z.string().optional()) }),
  component: ({ props, h, stateField }: ComponentRenderProps<{ name: string; value?: unknown }>) => {
    const field = stateField<string>(props.name, props.value, 'BoundInput')
    return h.input([h.Name(props.name), h.Value(field.value ?? ''), h.OnInput((value) => field.setValue(value))])
  },
})

export const BoundToggle = defineComponent({
  name: 'BoundToggle',
  description: 'A checkbox with a two-way $binding that can also run an action',
  props: z.object({ label: z.string(), checked: reactive(z.boolean().optional()), action: z.unknown().optional() }),
  component: ({ props, h, stateField }: ComponentRenderProps<{ label: string; checked?: unknown; action?: unknown }>) => {
    const field = stateField<boolean>(props.label, props.checked, 'BoundToggle')
    const checked = field.value === true
    return h.label([], [
      h.input([
        h.Type('checkbox'),
        h.Checked(checked),
        h.OnClick(field.setValue(!checked, props.action as ActionPlan | undefined)),
      ]),
      props.label,
    ])
  },
})

export const testLibrary = createLibrary({
  components: [Greeting, Button, TextInput, Card, BoundInput, BoundToggle],
})
