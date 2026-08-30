import * as assert from 'assert';
import { getMCPToolDefinitions } from '../src/mcp/tools';
import { getMCPResources } from '../src/mcp/resources';

describe('MCP Protocol Definitions', () => {
  it('should expose standardized MCP tool definitions', () => {
    const tools = getMCPToolDefinitions();
    assert.strictEqual(Array.isArray(tools), true);
    assert.strictEqual(tools.length, 9, 'Should expose 9 MCP tool definitions');

    const readFileTool = tools.find(t => t.name === 'ag_readFile');
    assert.ok(readFileTool);
    assert.strictEqual(readFileTool?.inputSchema.type, 'object');
    assert.ok(readFileTool?.inputSchema.properties.path);

    const replaceTool = tools.find(t => t.name === 'ag_replaceInFile');
    assert.ok(replaceTool);
    assert.ok(replaceTool?.inputSchema.properties.targetContent);
  });

  it('should list MCP workspace resources', async () => {
    const resources = await getMCPResources();
    assert.strictEqual(Array.isArray(resources), true);
    assert.strictEqual(resources.length >= 1, true);

    const baseInfo = resources.find(r => r.uri === 'ag://workspace/info');
    assert.ok(baseInfo);
    assert.strictEqual(baseInfo?.mimeType, 'application/json');
  });
});
