// Lightweight mock for VS Code API in headless Node unit tests
export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
};

const mockConfigStore: Record<string, any> = {};

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
      uri: { fsPath: '/mock/workspace', scheme: 'file', toString: () => 'file:///mock/workspace' },
      name: 'workspace',
      index: 0,
    },
  ],
  asRelativePath: (path: any) => String(path),
  findFiles: async () => [],
};

export const window = {
  createOutputChannel: () => ({
    appendLine: () => {},
    dispose: () => {},
  }),
  showInformationMessage: () => Promise.resolve(),
  showErrorMessage: () => Promise.resolve(),
  showWarningMessage: () => Promise.resolve(),
};

export const Uri = {
  file: (path: string) => ({ fsPath: path, scheme: 'file' }),
  parse: (uri: string) => ({ fsPath: uri, scheme: 'file' }),
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
