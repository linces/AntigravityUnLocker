export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  };
}

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ConnectFunctionDeclaration {
  name: string;
  description?: string;
  parameters?: Record<string, any>;
}

export interface ConnectFunctionCall {
  name: string;
  args?: Record<string, any>;
}

/**
 * Translates ConnectRPC function declarations into OpenAI tools payload schema
 */
export function translateConnectToolsToOpenAI(rawTools: any[]): OpenAITool[] {
  if (!Array.isArray(rawTools)) return [];

  const openAiTools: OpenAITool[] = [];

  for (const toolGroup of rawTools) {
    const decls: ConnectFunctionDeclaration[] = toolGroup.functionDeclarations || toolGroup.functions || [];
    for (const decl of decls) {
      if (decl && decl.name) {
        openAiTools.push({
          type: 'function',
          function: {
            name: decl.name,
            description: decl.description || '',
            parameters: decl.parameters || { type: 'object', properties: {} },
          },
        });
      }
    }
  }

  return openAiTools;
}

/**
 * Translates OpenAI tool calls array into ConnectRPC function calls format
 */
export function translateOpenAIToolCallsToConnect(toolCalls: OpenAIToolCall[]): ConnectFunctionCall[] {
  if (!Array.isArray(toolCalls)) return [];

  return toolCalls.map(call => {
    let argsObj: Record<string, any> = {};
    try {
      if (call.function?.arguments) {
        argsObj = JSON.parse(call.function.arguments);
      }
    } catch {
      argsObj = { raw: call.function?.arguments };
    }

    return {
      name: call.function?.name || 'unknown_tool',
      args: argsObj,
    };
  });
}
