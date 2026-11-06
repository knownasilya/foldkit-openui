import { z } from 'zod'
import { asChildren, defineComponent, Message, reactive, type ComponentRenderProps } from 'foldkit-openui'
import { action, asAction, color, size, subProps, type Color, type Size } from './shared.js'

const BUTTON_VARIANTS = ['solid', 'outline', 'soft', 'subtle', 'ghost', 'link'] as const

interface ButtonProps {
  label: string
  action?: unknown
  color: Color
  variant: (typeof BUTTON_VARIANTS)[number]
  size: Size
}

export const Button = defineComponent({
  name: 'Button',
  description:
    'A button, after Nuxt UI Button. `action` runs on click. `variant`: solid|outline|soft|subtle|ghost|link. `size`: xs|sm|md|lg|xl.',
  props: z.object({
    label: z.string(),
    action: action(),
    color: color(),
    variant: z.enum(BUTTON_VARIANTS).default('solid'),
    size: size(),
  }),
  component: ({ props, h, triggerAction }: ComponentRenderProps<ButtonProps>) =>
    h.button(
      [
        h.Type('button'),
        h.Class('nui-btn'),
        h.DataAttribute('color', props.color),
        h.DataAttribute('variant', props.variant),
        h.DataAttribute('size', props.size),
        h.OnClick(triggerAction(props.label, undefined, asAction(props.action))),
      ],
      [props.label],
    ),
})

const Rules = z
  .object({
    required: z.boolean().optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .optional()
type Rules = z.infer<typeof Rules>

const INPUT_TYPES = ['text', 'email', 'password', 'number', 'search', 'url', 'tel', 'date'] as const

interface InputProps {
  name: string
  placeholder?: string | null
  type: (typeof INPUT_TYPES)[number]
  rules?: Rules | null
  value?: unknown
  action?: unknown
}

export const Input = defineComponent({
  name: 'Input',
  description:
    'A text input, after Nuxt UI Input. Bind `value` to a $variable to use what the user types elsewhere. `action` runs when the user presses Enter (e.g. add a todo). `rules`: {required?, minLength?, maxLength?, min?, max?}.',
  props: z.object({
    name: z.string(),
    placeholder: z.string().nullable().optional(),
    type: z.enum(INPUT_TYPES).default('text'),
    rules: Rules.nullable(),
    value: reactive(z.string().optional()),
    action: action(),
  }),
  component: ({ props, h, stateField, triggerAction }: ComponentRenderProps<InputProps>) => {
    const field = stateField<string | number>(props.name, props.value, 'Input')
    const enterAction = asAction(props.action)
    const rules = props.rules ?? {}
    return h.input([
      h.Class('nui-input'),
      h.Name(props.name),
      h.Type(props.type),
      h.Value(field.value === undefined || field.value === null ? '' : String(field.value)),
      ...(props.placeholder ? [h.Placeholder(props.placeholder)] : []),
      ...(rules.required ? [h.Required(true)] : []),
      ...(rules.minLength !== undefined ? [h.Minlength(rules.minLength)] : []),
      ...(rules.maxLength !== undefined ? [h.Maxlength(rules.maxLength)] : []),
      ...(rules.min !== undefined ? [h.Min(String(rules.min))] : []),
      ...(rules.max !== undefined ? [h.Max(String(rules.max))] : []),
      h.OnInput((value) => field.setValue(props.type === 'number' && value !== '' ? Number(value) : value)),
      ...(enterAction
        ? [h.OnKeyDown((key) => (key === 'Enter' ? triggerAction(props.name, undefined, enterAction) : Message.NoOp()))]
        : []),
    ])
  },
})

interface TextareaProps {
  name: string
  placeholder?: string | null
  rows: number
  value?: unknown
}

export const Textarea = defineComponent({
  name: 'Textarea',
  description: 'A multi-line text input, after Nuxt UI Textarea. Bind `value` to a $variable.',
  props: z.object({
    name: z.string(),
    placeholder: z.string().nullable().optional(),
    rows: z.number().default(3),
    value: reactive(z.string().optional()),
  }),
  component: ({ props, h, stateField }: ComponentRenderProps<TextareaProps>) => {
    const field = stateField<string>(props.name, props.value, 'Textarea')
    return h.textarea([
      h.Class('nui-input'),
      h.Name(props.name),
      h.Rows(props.rows),
      h.Value(field.value ?? ''),
      ...(props.placeholder ? [h.Placeholder(props.placeholder)] : []),
      h.OnInput((value) => field.setValue(value)),
    ])
  },
})

export const SelectItem = defineComponent({
  name: 'SelectItem',
  description: 'One option of a Select or RadioGroup.',
  props: z.object({ value: z.string(), label: z.string() }),
  component: () => null,
})

interface Option {
  value: string
  label: string
}

const options = (items: unknown[] | undefined): Option[] =>
  (items ?? []).flatMap((node) => {
    const option = subProps<Option>(node)
    return option ? [{ value: String(option.value), label: String(option.label ?? option.value) }] : []
  })

interface SelectProps {
  name: string
  items: unknown[]
  placeholder?: string | null
  rules?: Rules | null
  value?: unknown
}

export const Select = defineComponent({
  name: 'Select',
  description:
    'A dropdown, after Nuxt UI Select: Select("role", [SelectItem("dev", "Developer"), ...], "Pick one", null, $role). Bind `value` to a $variable; pass that $variable to a Query() to filter it.',
  props: z.object({
    name: z.string(),
    items: z.array(SelectItem.ref).default([]),
    placeholder: z.string().nullable().optional(),
    rules: Rules.nullable(),
    value: reactive(z.string().optional()),
  }),
  component: ({ props, h, stateField }: ComponentRenderProps<SelectProps>) => {
    const field = stateField<string>(props.name, props.value, 'Select')
    const current = field.value ?? ''
    return h.select(
      [
        h.Class('nui-input'),
        h.Name(props.name),
        h.Value(current),
        ...(props.rules?.required ? [h.Required(true)] : []),
        h.OnChange((value) => field.setValue(value)),
      ],
      [
        ...(props.placeholder ? [h.option([h.Value(''), h.Disabled(true), h.Selected(current === '')], [props.placeholder])] : []),
        ...options(props.items).map((option) =>
          h.keyed('option')(option.value, [h.Value(option.value), h.Selected(option.value === current)], [option.label]),
        ),
      ],
    )
  },
})

interface RadioGroupProps {
  name: string
  items: unknown[]
  value?: unknown
  legend?: string
}

export const RadioGroup = defineComponent({
  name: 'RadioGroup',
  description: 'Mutually exclusive options, after Nuxt UI RadioGroup: RadioGroup("plan", [SelectItem("free", "Free"), ...], $plan, "Plan").',
  props: z.object({
    name: z.string(),
    items: z.array(SelectItem.ref).default([]),
    value: reactive(z.string().optional()),
    legend: z.string().optional(),
  }),
  component: ({ props, h, stateField }: ComponentRenderProps<RadioGroupProps>) => {
    const field = stateField<string>(props.name, props.value, 'RadioGroup')
    return h.fieldset([h.Class('nui-radio-group')], [
      props.legend ? h.legend([], [props.legend]) : h.empty,
      ...options(props.items).map((option) =>
        h.keyed('label')(option.value, [h.Class('nui-choice')], [
          h.input([
            h.Type('radio'),
            h.Name(props.name),
            h.Value(option.value),
            h.Checked(field.value === option.value),
            h.OnChange(() => field.setValue(option.value)),
          ]),
          h.span([], [option.label]),
        ]),
      ),
    ])
  },
})

interface ToggleProps {
  label: string
  checked?: unknown
  action?: unknown
  description?: string
  color: Color
}

// A fresh schema per component: lang-core tags each props schema with its
// component's name, so Checkbox and Switch must not share one object.
const toggleProps = () =>
  z.object({
    label: z.string(),
    checked: reactive(z.boolean().optional()),
    action: action(),
    description: z.string().optional(),
    color: color(),
  })

/**
 * Shared by Checkbox and Switch. A `$variable` is written first, then
 * `action` runs. A literal `checked` with an `action` (a todo's `t.done`)
 * only runs the action: the data's owner flips it, and the next Query()
 * brings the new value back.
 */
function renderToggle(kind: 'checkbox' | 'switch', componentType: string) {
  return ({ props, h, stateField, triggerAction }: ComponentRenderProps<ToggleProps>) => {
    const field = stateField<boolean>(props.label, props.checked, componentType)
    const checked = field.value === true
    const plan = asAction(props.action)
    const onToggle = !field.isReactive && plan ? triggerAction(props.label, undefined, plan) : field.setValue(!checked, plan)
    return h.label([h.Class(`nui-choice nui-${kind}`), h.DataAttribute('color', props.color)], [
      h.input([
        h.Type('checkbox'),
        ...(kind === 'switch' ? [h.Role('switch')] : []),
        h.Checked(checked),
        h.OnClick(onToggle),
      ]),
      h.span([h.Class('nui-choice-text')], [
        h.span([], [props.label]),
        props.description ? h.small([], [props.description]) : h.empty,
      ]),
    ])
  }
}

export const Checkbox = defineComponent({
  name: 'Checkbox',
  description:
    'A checkbox, after Nuxt UI Checkbox. Bind `checked` to a $variable, or pass a value from data (t.done) with an `action` that saves the change.',
  props: toggleProps(),
  component: renderToggle('checkbox', 'Checkbox'),
})

export const Switch = defineComponent({
  name: 'Switch',
  description: 'An on/off switch, after Nuxt UI Switch. Same arguments as Checkbox.',
  props: toggleProps(),
  component: renderToggle('switch', 'Switch'),
})

interface SliderProps {
  name: string
  value?: unknown
  min: number
  max: number
  step: number
}

export const Slider = defineComponent({
  name: 'Slider',
  description: 'A range slider, after Nuxt UI Slider: Slider("volume", $volume, 0, 100, 5). Shows the current value.',
  props: z.object({
    name: z.string(),
    value: reactive(z.number().optional()),
    min: z.number().default(0),
    max: z.number().default(100),
    step: z.number().default(1),
  }),
  component: ({ props, h, stateField }: ComponentRenderProps<SliderProps>) => {
    const field = stateField<number>(props.name, props.value, 'Slider')
    const value = typeof field.value === 'number' ? field.value : Number(field.value ?? props.min) || props.min
    return h.div([h.Class('nui-slider')], [
      h.input([
        h.Type('range'),
        h.Name(props.name),
        h.Min(String(props.min)),
        h.Max(String(props.max)),
        h.Step(String(props.step)),
        h.Value(String(value)),
        h.OnInput((next) => field.setValue(Number(next))),
      ]),
      h.output([], [String(value)]),
    ])
  },
})

interface FormFieldProps {
  label: string
  control: unknown
  description?: string
  required: boolean
}

export const FormField = defineComponent({
  name: 'FormField',
  description:
    'A label and optional description around one control, after Nuxt UI FormField: FormField("Email", Input("email", "you@example.com", "email", null, $email)).',
  props: z.object({
    label: z.string(),
    control: z.unknown(),
    description: z.string().optional(),
    required: z.boolean().default(false),
  }),
  component: ({ props, h, renderNode }: ComponentRenderProps<FormFieldProps>) =>
    h.label([h.Class('nui-form-field')], [
      h.span([h.Class('nui-form-field-label')], [props.label, props.required ? h.span([h.Class('required')], [' *']) : h.empty]),
      props.description ? h.small([], [props.description]) : h.empty,
      ...asChildren(renderNode(props.control)),
    ]),
})
