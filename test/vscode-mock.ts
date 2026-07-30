// Lightweight mock for VS Code API in headless Node unit tests
export const workspace = {
  getConfiguration: () => ({
    get: (key: string, defaultValue?: any) => defaultValue,
  }),
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
