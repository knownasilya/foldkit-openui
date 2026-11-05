import { extractToolResult, ToolNotFoundError, type McpClientLike, type ToolProvider } from '@openuidev/lang-core'

/** What `init`'s `toolProvider` option accepts: an MCP-like client, or a plain map of tool name to handler. */
export type ToolProviderInput =
  | Record<string, (args: Record<string, unknown>) => Promise<unknown>>
  | McpClientLike

/**
 * Normalizes an MCP-like client or a function map into `@openuidev/lang-core`'s
 * `ToolProvider` shape. Detects an MCP client by its `callTool` method and
 * unwraps its result with `extractToolResult`; otherwise looks the tool name
 * up in the map directly.
 */
export function normalizeToolProvider(input: ToolProviderInput): ToolProvider {
  return {
    async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
      if (typeof (input as McpClientLike).callTool === 'function') {
        const result = await (input as McpClientLike).callTool({ name: toolName, arguments: args })
        return extractToolResult(result)
      }
      const map = input as Record<string, (args: Record<string, unknown>) => Promise<unknown>>
      const fn = map[toolName]
      if (!fn) throw new ToolNotFoundError(toolName, Object.keys(map))
      return fn(args)
    },
  }
}
