/**
 * OpenUI's `$state` and form-field store, reimplemented as pure data instead
 * of porting `@openuidev/lang-core`'s imperative `Store` class. Foldkit's
 * Model already *is* the single reactive source of truth, so there is no
 * second subscribe/notify layer to bridge in — the snapshot just lives on
 * the Model and update()s return a new one, same as any other field.
 *
 * A form field's value is wrapped as `{ value, componentType }`, matching
 * `@openuidev/lang-core`'s wire shape so `getState`/`resolveRef` in
 * `EvaluationContext` see the same thing the reference renderers do.
 *
 * `pristineKeys` tracks which `$state` bindings still hold their
 * declared default. A later parse (new default for the same binding) may
 * still replace a pristine value; once the user — or an action's `Set` step —
 * writes to it, it is no longer pristine and future declared defaults leave
 * it alone. This mirrors `Store.set`'s documented `pristine` option.
 */

export interface FieldValue {
  readonly value: unknown
  readonly componentType?: string
}

export interface StoreState {
  readonly snapshot: Record<string, unknown>
  readonly pristineKeys: Readonly<Record<string, true>>
}

export const emptyStore: StoreState = { snapshot: {}, pristineKeys: {} }

function isFieldValue(value: unknown): value is FieldValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'value' in (value as Record<string, unknown>)
  )
}

/** Unwraps a `{ value, componentType }` form-field entry. Returns raw `$state` values unchanged. */
export function unwrapFieldValue(value: unknown): unknown {
  return isFieldValue(value) ? value.value : value
}

export function getRaw(store: StoreState, name: string): unknown {
  return store.snapshot[name]
}

export function get(store: StoreState, name: string): unknown {
  return unwrapFieldValue(getRaw(store, name))
}

/** Writes a value directly (a `$state` binding, or a pre-wrapped form entry). Clears pristine. */
export function set(store: StoreState, name: string, value: unknown): StoreState {
  if (store.snapshot[name] === value && !(name in store.pristineKeys)) return store
  const { [name]: _removed, ...pristineKeys } = store.pristineKeys
  return { snapshot: { ...store.snapshot, [name]: value }, pristineKeys }
}

/** Writes a declared default. Only applies when the key is absent or still pristine. */
function setPristine(store: StoreState, name: string, value: unknown): StoreState {
  const hasValue = name in store.snapshot
  if (hasValue && !(name in store.pristineKeys)) return store
  if (hasValue && store.snapshot[name] === value) return store
  return {
    snapshot: { ...store.snapshot, [name]: value },
    pristineKeys: { ...store.pristineKeys, [name]: true },
  }
}

/** Merges newly declared `$state` defaults from a fresh parse into the store. */
export function applyStateDeclarations(
  store: StoreState,
  stateDeclarations: Record<string, unknown>,
): StoreState {
  let next = store
  for (const [name, defaultValue] of Object.entries(stateDeclarations)) {
    next = setPristine(next, name, defaultValue)
  }
  return next
}

/** Reads a form field's current value, scoped to its form when `formName` is given. */
export function getFieldValue(store: StoreState, formName: string | undefined, name: string): unknown {
  if (!formName) return get(store, name)
  const formData = get(store, formName)
  if (!formData || typeof formData !== 'object' || Array.isArray(formData)) return undefined
  return unwrapFieldValue((formData as Record<string, unknown>)[name])
}

/** Writes a form field's value, scoped to its form when `formName` is given. */
export function setFieldValue(
  store: StoreState,
  formName: string | undefined,
  componentType: string | undefined,
  name: string,
  value: unknown,
): StoreState {
  const wrapped: FieldValue = { value, componentType }
  if (!formName) return set(store, name, wrapped)
  const raw = getRaw(store, formName)
  const formData = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return set(store, formName, { ...formData, [name]: wrapped })
}

/** Materializes the payload a triggered action reports: just the one form, or the whole store. */
export function getFormPayload(store: StoreState, formName?: string): Record<string, unknown> {
  if (formName) {
    const raw = getRaw(store, formName)
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { [formName]: raw }
  }
  return store.snapshot
}
