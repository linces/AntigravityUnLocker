// Lightweight mock for VS Code API in headless Node unit tests
import path from 'path';

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
};

const mockConfigStore: Record<string, any> = {};
export const mockFileStore = new Map<string, string>();

export function setMockFile(filePath: string, content: string): void {
  const norm = filePath.replace(/\\/g, '/');
  mockFileStore.set(norm, content);
}

export function getMockFile(filePath: string): string | undefined {
  const norm = filePath.replace(/\\/g, '/');
  return mockFileStore.get(norm);
}

export const Position = class {
  constructor(public line: number, public character: number) {}
};

export const Range = class {
  constructor(public start: any, public end: any) {}
};

export const FileType = {
  Unknown: 0,
  File: 1,
  Directory: 2,
  SymbolicLink: 64,
};

export const DiagnosticSeverity = {
  Error: 0,
  Warning: 1,
  Information: 2,
  Hint: 3,
};

export const languages = {
  getDiagnostics: () => [],
};

export const commands = {
  registerCommand: () => ({ dispose: () => {} }),
  executeCommand: () => Promise.resolve(),
};

export const workspace = {
  getConfiguration: (section?: string) => ({
    get: (key: string, defaultValue?: any) => {
      const fullKey = section ? `${section}.${key}` : key;
      return mockConfigStore[fullKey] !== undefined ? mockConfigStore[fullKey] : defaultValue;
    },
    update: async (key: string, value: any) => {
      const fullKey = section ? `${section}.${key}` : key;
      mockConfigStore[fullKey] = value;
    },
  }),
  onDidChangeConfiguration: () => ({ dispose: () => {} }),
  workspaceFolders: [
    {
      uri: {
        fsPath: '/mock/workspace',
        path: '/mock/workspace',
        scheme: 'file',
        toString: () => 'file:///mock/workspace',
        with: (change: any) => ({
          fsPath: change.path || '/mock/workspace',
          path: change.path || '/mock/workspace',
          scheme: 'file',
        }),
      },
      name: 'workspace',
      index: 0,
    },
  ],
  asRelativePath: (p: any) => String(p).replace('/mock/workspace/', ''),
  findFiles: async () => [],
  registerTextDocumentContentProvider: () => ({ dispose: () => {} }),
  fs: {
    writeFile: async (uri: any, data: Uint8Array) => {
      const norm = (uri.fsPath || uri.path || String(uri)).replace(/\\/g, '/');
      mockFileStore.set(norm, new TextDecoder().decode(data));
    },
    readFile: async (uri: any) => {
      const norm = (uri.fsPath || uri.path || String(uri)).replace(/\\/g, '/');
      const content = mockFileStore.get(norm) || '';
      return new TextEncoder().encode(content);
    },
  },
  openTextDocument: async (uri: any) => {
    const norm = (uri.fsPath || uri.path || String(uri)).replace(/\\/g, '/');
    const text = mockFileStore.get(norm) ?? '';
    const lines = text.split('\n');
    return {
      getText: () => text,
      lineCount: lines.length,
      languageId: 'typescript',
      lineAt: (lineNum: number) => ({ text: lines[lineNum] || '' }),
    };
  },
};

export const window = {
  createOutputChannel: () => ({
    appendLine: () => {},
    dispose: () => {},
  }),
  showInformationMessage: () => Promise.resolve(),
  showErrorMessage: () => Promise.resolve(),
  showWarningMessage: () => Promise.resolve('Allow'),
};

export const Uri = {
  file: (filePath: string) => {
    const norm = path.posix.normalize(filePath.replace(/\\/g, '/'));
    return {
      fsPath: norm,
      path: norm,
      scheme: 'file',
      with: (change: any) => ({
        fsPath: path.posix.normalize((change.path || norm).replace(/\\/g, '/')),
        path: path.posix.normalize((change.path || norm).replace(/\\/g, '/')),
        scheme: 'file',
      }),
    };
  },
  parse: (uri: string) => {
    const norm = path.posix.normalize(uri.replace('file://', '').replace(/\\/g, '/'));
    return {
      fsPath: norm,
      path: norm,
      scheme: 'file',
      with: (change: any) => ({
        fsPath: path.posix.normalize((change.path || norm).replace(/\\/g, '/')),
        path: path.posix.normalize((change.path || norm).replace(/\\/g, '/')),
        scheme: 'file',
      }),
    };
  },
  joinPath: (base: any, ...pathSegments: string[]) => {
    const basePath = (base.fsPath || base.path || '').replace(/\\/g, '/').replace(/\/$/, '');
    const cleanSegments = pathSegments.map((s) => s.replace(/^[/\\]+/, '').replace(/\\/g, '/'));
    const joined = path.posix.normalize([basePath, ...cleanSegments].join('/'));
    return {
      fsPath: joined,
      path: joined,
      scheme: 'file',
      with: (change: any) => ({
        fsPath: path.posix.normalize((change.path || joined).replace(/\\/g, '/')),
        path: path.posix.normalize((change.path || joined).replace(/\\/g, '/')),
        scheme: 'file',
      }),
    };
  },
  from: (components: { scheme: string; path: string; authority?: string }) => {
    const norm = path.posix.normalize(components.path.replace(/\\/g, '/'));
    return {
      fsPath: norm,
      path: norm,
      scheme: components.scheme,
      authority: components.authority || '',
      toString: () => `${components.scheme}://${components.authority || ''}${norm}`,
      with: (change: any) => ({
        fsPath: path.posix.normalize((change.path || norm).replace(/\\/g, '/')),
        path: path.posix.normalize((change.path || norm).replace(/\\/g, '/')),
        scheme: change.scheme || components.scheme,
      }),
    };
  },
};

export const EventEmitter = class {
  event = () => {};
  fire = () => {};
  dispose = () => {};
};

export const ThemeIcon = class {
  constructor(public id: string) {}
};

export const TreeItem = class {
  constructor(public label: string) {}
};

export const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
};
