// Tokenizers for syntax highlighting: OpenUI Lang for the editor and agent
// patches, JSON for action-log payloads. They only color text, so they are
// forgiving: an unterminated string mid-typing is still a string, and any
// character they do not know passes through as plain text.

export type TokenKind =
  | 'plain'
  | 'comment'
  | 'string'
  | 'number'
  | 'literal'
  | 'state'
  | 'builtin'
  | 'special'
  | 'component'
  | 'statement'
  | 'key'
  | 'ident'
  | 'operator'
  | 'punct'

export interface Token {
  readonly kind: TokenKind
  readonly text: string
}

const LITERALS = new Set(['true', 'false', 'null'])
/** Calls the runtime treats specially, rather than as components. */
const SPECIAL_CALLS = new Set(['Query', 'Mutation', 'Action'])

// One alternation, one capture group per token kind, scanned left to right.
const OPENUI_TOKEN =
  /(\/\/[^\n]*|#[^\n]*)|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)|(\d+(?:\.\d+)?)|(\$[A-Za-z_]\w*)|(@[A-Za-z_]\w*)|([A-Za-z_]\w*)|(==|!=|>=|<=|&&|\|\||[=+\-*/%<>!?:])|([()[\]{},.])/g

const JSON_TOKEN = /("(?:[^"\\\n]|\\.)*"?)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])/g

function push(tokens: Token[], kind: TokenKind, text: string) {
  if (!text) return
  const last = tokens[tokens.length - 1]
  if (last && last.kind === kind && kind === 'plain') {
    tokens[tokens.length - 1] = { kind, text: last.text + text }
  } else {
    tokens.push({ kind, text })
  }
}

const startsLine = (source: string, index: number) => /^[ \t]*$/.test(source.slice(source.lastIndexOf('\n', index - 1) + 1, index))

function identifierKind(source: string, word: string, end: number, previous: string | undefined, start: number): TokenKind {
  if (LITERALS.has(word)) return 'literal'
  const rest = source.slice(end)
  if (/^\s*\(/.test(rest)) return SPECIAL_CALLS.has(word) ? 'special' : 'component'
  if (startsLine(source, start) && /^\s*=(?!=)/.test(rest)) return 'statement'
  if ((previous === '{' || previous === ',') && /^\s*:/.test(rest)) return 'key'
  return 'ident'
}

export function tokenizeOpenUI(source: string): Token[] {
  const tokens: Token[] = []
  let cursor = 0
  let previous: string | undefined
  for (const match of source.matchAll(OPENUI_TOKEN)) {
    const start = match.index
    const text = match[0]
    push(tokens, 'plain', source.slice(cursor, start))
    cursor = start + text.length
    const [, comment, string, number, state, builtin, word, operator] = match
    const kind: TokenKind = comment
      ? 'comment'
      : string
        ? 'string'
        : number
          ? 'number'
          : state
            ? 'state'
            : builtin
              ? 'builtin'
              : word
                ? identifierKind(source, word, cursor, previous, start)
                : operator
                  ? 'operator'
                  : 'punct'
    push(tokens, kind, text)
    if (kind !== 'comment') previous = text
  }
  push(tokens, 'plain', source.slice(cursor))
  return tokens
}

export function tokenizeJson(text: string): Token[] {
  const tokens: Token[] = []
  let cursor = 0
  for (const match of text.matchAll(JSON_TOKEN)) {
    const start = match.index
    push(tokens, 'plain', text.slice(cursor, start))
    cursor = start + match[0].length
    const [, string, number, literal] = match
    const kind: TokenKind = string
      ? /^\s*:/.test(text.slice(cursor))
        ? 'key'
        : 'string'
      : number
        ? 'number'
        : literal
          ? 'literal'
          : 'punct'
    push(tokens, kind, match[0])
  }
  push(tokens, 'plain', text.slice(cursor))
  return tokens
}
