import { describe, expect, it } from 'vitest'
import type { ParseResult } from '@openuidev/lang-core'
import { init, type Model } from '../model.js'
import { buildMutationNodes, buildQueryNodes } from '../query.js'
import { testLibrary } from './fixtures.js'

function modelWithParseResult(partial: Partial<ParseResult>, store: Model['store'] = { snapshot: {}, pristineKeys: {} }): Model {
  const model = init({ library: testLibrary })
  return {
    ...model,
    store,
    parseResult: {
      root: null,
      meta: { incomplete: false, unresolved: [], orphaned: [], statementCount: 0, errors: [] },
      stateDeclarations: {},
      queryStatements: [],
      mutationStatements: [],
      ...partial,
    },
  }
}

describe('buildQueryNodes', () => {
  it('evaluates the tool name, args, and declared deps from the current store', () => {
    const model = modelWithParseResult(
      {
        queryStatements: [
          {
            statementId: 'users',
            toolAST: { k: 'Str', v: 'get_users' },
            argsAST: { k: 'Obj', entries: [['page', { k: 'StateRef', n: '$page' }]] },
            defaultsAST: { k: 'Arr', els: [] },
            refreshAST: { k: 'Num', v: 30 },
            deps: ['$page'],
            complete: true,
          },
        ],
      },
      { snapshot: { $page: 2 }, pristineKeys: {} },
    )

    expect(buildQueryNodes(model)).toEqual([
      {
        statementId: 'users',
        toolName: 'get_users',
        args: { page: 2 },
        defaults: [],
        refreshInterval: 30,
        deps: { $page: 2 },
        complete: true,
      },
    ])
  })

  it('returns an empty list when there are no Query() statements', () => {
    expect(buildQueryNodes(modelWithParseResult({}))).toEqual([])
  })
})

describe('buildMutationNodes', () => {
  it('evaluates the tool name', () => {
    const model = modelWithParseResult({
      mutationStatements: [{ statementId: 'createItem', toolAST: { k: 'Str', v: 'create_item' }, argsAST: null }],
    })
    expect(buildMutationNodes(model)).toEqual([{ statementId: 'createItem', toolName: 'create_item' }])
  })
})
