import * as assert from 'assert';
import { MCPClientManager, MCPServerConfig } from '../src/mcp/client';
import { ToolRegistry } from '../src/tools/tool-registry';

describe('Remote MCP SSE Transport', () => {
  const outputChannel = {
    appendLine: () => {},
    dispose: () => {},
  } as any;

  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    toolRegistry = new ToolRegistry(outputChannel);
  });

  it('should instantiate and configure remote SSE server process', async () => {
    const manager = new MCPClientManager(toolRegistry, outputChannel);

    // Mock loadConfigurations to provide an SSE configuration
    const sseConfig: MCPServerConfig = {
      transport: 'sse',
      url: 'http://127.0.0.1:59999/nonexistent-sse',
      headers: { Authorization: 'Bearer test-token' },
    };

    manager.loadConfigurations = () => ({
      'remote-agent': sseConfig,
    });

    await manager.reloadServers();

    const statuses = manager.getServerStatuses();
    const remoteServer = statuses.find((s) => s.id === 'remote-agent');

    assert.ok(remoteServer, 'Remote server should be tracked in status list');
    // Since localhost:59999 is nonexistent, status should transition to error
    assert.strictEqual(remoteServer?.status, 'error');
    assert.ok(remoteServer?.error, 'Should capture connection error details');

    manager.dispose();
  });

  it('should validate missing URL for remote SSE server', async () => {
    const manager = new MCPClientManager(toolRegistry, outputChannel);

    const invalidSseConfig: MCPServerConfig = {
      transport: 'sse',
      // missing url
    };

    manager.loadConfigurations = () => ({
      'invalid-remote': invalidSseConfig,
    });

    await manager.reloadServers();

    const statuses = manager.getServerStatuses();
    const server = statuses.find((s) => s.id === 'invalid-remote');

    assert.ok(server);
    assert.strictEqual(server?.status, 'error');
    assert.ok(server?.error?.includes('requires "url"'));

    manager.dispose();
  });
});
