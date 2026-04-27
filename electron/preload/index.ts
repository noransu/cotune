import { contextBridge, ipcRenderer } from 'electron'

export type PtyDataCallback = (data: string) => void
export type PtyExitCallback = (info: { exitCode: number; signal?: number }) => void

const api = {
  // ===== Window controls =====
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onMaximizedChanged: (callback: (isMaximized: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: boolean) =>
      callback(value)
    ipcRenderer.on('window:maximized-changed', listener)
    return () => ipcRenderer.removeListener('window:maximized-changed', listener)
  },

  // ===== PTY operations =====
  ptyCreate: (opts: {
    projectId: string
    projectPath: string
    cols: number
    rows: number
  }) => ipcRenderer.invoke('pty:create', opts),

  ptyWrite: (opts: { projectId: string; data: string }) =>
    ipcRenderer.invoke('pty:write', opts),

  ptyResize: (opts: { projectId: string; cols: number; rows: number }) =>
    ipcRenderer.invoke('pty:resize', opts),

  ptyDestroy: (opts: { projectId: string }) =>
    ipcRenderer.invoke('pty:destroy', opts),

  ptyExists: (opts: { projectId: string }) =>
    ipcRenderer.invoke('pty:exists', opts),

  onPtyData: (projectId: string, callback: PtyDataCallback) => {
    const channel = `pty:data:${projectId}`
    const listener = (_event: Electron.IpcRendererEvent, data: string) =>
      callback(data)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },

  onPtyExit: (projectId: string, callback: PtyExitCallback) => {
    const channel = `pty:exit:${projectId}`
    const listener = (
      _event: Electron.IpcRendererEvent,
      info: { exitCode: number; signal?: number }
    ) => callback(info)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },

  // ===== Project management =====
  projectList: () => ipcRenderer.invoke('project:list'),
  projectGetActive: () => ipcRenderer.invoke('project:getActive'),
  projectSetActive: (projectId: string) =>
    ipcRenderer.invoke('project:setActive', projectId),
  projectCreate: (project: unknown) =>
    ipcRenderer.invoke('project:create', project),
  projectUpdate: (project: unknown) =>
    ipcRenderer.invoke('project:update', project),
  projectDelete: (projectId: string) =>
    ipcRenderer.invoke('project:delete', projectId),
  projectSelectDirectory: () => ipcRenderer.invoke('project:selectDirectory'),
  projectDetectFrontend: (dirPath: string) =>
    ipcRenderer.invoke('project:detectFrontend', dirPath),
  projectDetectBackend: (dirPath: string) =>
    ipcRenderer.invoke('project:detectBackend', dirPath),
  projectDetectBackendEntries: (dirPath: string) =>
    ipcRenderer.invoke('project:detectBackendEntries', dirPath),

  // ===== Workspace (Home page project directories) =====
  workspaceList: () => ipcRenderer.invoke('workspace:list'),
  workspaceGetActive: () => ipcRenderer.invoke('workspace:getActive'),
  workspaceSetActive: (id: string) => ipcRenderer.invoke('workspace:setActive', id),
  workspaceCreate: (ws: unknown) => ipcRenderer.invoke('workspace:create', ws),
  workspaceUpdate: (ws: unknown) => ipcRenderer.invoke('workspace:update', ws),
  workspaceDelete: (id: string) => ipcRenderer.invoke('workspace:delete', id),

  // ===== Session (CodeMaker CLI) =====
  sessionList: (opts: { directories?: string[]; limit?: number }) =>
    ipcRenderer.invoke('session:list', opts),
  sessionListByPrefix: (opts: { directory: string; limit?: number }) =>
    ipcRenderer.invoke('session:listByPrefix', opts),
  sessionGetParts: (opts: { sessionId: string; types?: string[]; limit?: number }) =>
    ipcRenderer.invoke('session:getParts', opts),
  sessionDbExists: () => ipcRenderer.invoke('session:dbExists'),

  // ===== Proxy =====
  proxyStart: (opts: {
    port: number
    frontendPort: number
    frontendHost?: string
    rules: unknown[]
  }) => ipcRenderer.invoke('proxy:start', opts),
  proxyStop: () => ipcRenderer.invoke('proxy:stop'),
  proxyUpdateRules: (rules: unknown[]) =>
    ipcRenderer.invoke('proxy:updateRules', rules),
  proxyStatus: () => ipcRenderer.invoke('proxy:status'),
  proxyParseRoutes: (projectPath: string) =>
    ipcRenderer.invoke('proxy:parseRoutes', projectPath),
  onProxyLog: (callback: (entry: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, entry: unknown) =>
      callback(entry)
    ipcRenderer.on('proxy:log', listener)
    return () => ipcRenderer.removeListener('proxy:log', listener)
  },

  // ===== Process management =====
  processStart: (opts: {
    id: string
    type: 'frontend' | 'backend'
    projectId: string
    command: string
    cwd: string
    port: number
  }) => ipcRenderer.invoke('process:start', opts),
  processStop: (processKey: string) =>
    ipcRenderer.invoke('process:stop', processKey),
  processStopAll: () => ipcRenderer.invoke('process:stopAll'),
  processList: () => ipcRenderer.invoke('process:list'),
  onProcessOutput: (
    callback: (data: { processKey: string; type: string; data: string }) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: { processKey: string; type: string; data: string }
    ) => callback(data)
    ipcRenderer.on('process:output', listener)
    return () => ipcRenderer.removeListener('process:output', listener)
  },
  onProcessStatus: (
    callback: (data: {
      processKey: string
      status: string
      exitCode?: number
      error?: string
    }) => void
  ) => {
    const listener = (_event: Electron.IpcRendererEvent, data: unknown) =>
      callback(data as any)
    ipcRenderer.on('process:status', listener)
    return () => ipcRenderer.removeListener('process:status', listener)
  },

  // ===== Browser tab management =====
  browserCreateTab: (opts: { id: string; url?: string }) =>
    ipcRenderer.invoke('browser:createTab', opts),
  browserShowTab: (opts: { id: string }) =>
    ipcRenderer.invoke('browser:showTab', opts),
  browserHideAll: () => ipcRenderer.invoke('browser:hideAll'),
  browserCloseTab: (opts: { id: string }) =>
    ipcRenderer.invoke('browser:closeTab', opts),
  browserNavigate: (opts: { id: string; url: string }) =>
    ipcRenderer.invoke('browser:navigate', opts),
  browserGoBack: (opts: { id: string }) =>
    ipcRenderer.invoke('browser:goBack', opts),
  browserGoForward: (opts: { id: string }) =>
    ipcRenderer.invoke('browser:goForward', opts),
  browserReload: (opts: { id: string }) =>
    ipcRenderer.invoke('browser:reload', opts),
  browserDevTools: (opts: { id: string }) =>
    ipcRenderer.invoke('browser:devtools', opts),
  browserSetProxyPort: (opts: { port: number }) =>
    ipcRenderer.invoke('browser:setProxyPort', opts),
  browserSetSidePanelWidth: (opts: { width: number }) =>
    ipcRenderer.invoke('browser:setSidePanelWidth', opts),
  onBrowserTitleUpdated: (callback: (data: { id: string; title: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { id: string; title: string }) =>
      callback(data)
    ipcRenderer.on('browser:title-updated', listener)
    return () => ipcRenderer.removeListener('browser:title-updated', listener)
  },
  onBrowserUrlUpdated: (callback: (data: { id: string; url: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { id: string; url: string }) =>
      callback(data)
    ipcRenderer.on('browser:url-updated', listener)
    return () => ipcRenderer.removeListener('browser:url-updated', listener)
  },

  // ===== GitLab =====
  gitlabGetInstances: () => ipcRenderer.invoke('gitlab:getInstances'),
  gitlabAddInstance: (data: { name: string; url: string; token: string }) =>
    ipcRenderer.invoke('gitlab:addInstance', data),
  gitlabUpdateInstance: (instance: unknown) =>
    ipcRenderer.invoke('gitlab:updateInstance', instance),
  gitlabRemoveInstance: (id: string) =>
    ipcRenderer.invoke('gitlab:removeInstance', id),
  gitlabValidateToken: (data: { url: string; token: string }) =>
    ipcRenderer.invoke('gitlab:validateToken', data),
  gitlabGetGroups: (instanceId: string) =>
    ipcRenderer.invoke('gitlab:getGroups', instanceId),
  gitlabSearch: (params: {
    instanceId: string
    scope: string
    query: string
    groupId?: number
    page?: number
    perPage?: number
  }) => ipcRenderer.invoke('gitlab:search', params),
  gitlabGetFileContent: (data: {
    instanceId: string
    projectId: number
    filePath: string
    ref: string
  }) => ipcRenderer.invoke('gitlab:getFileContent', data),
  gitlabBuildWebUrl: (data: {
    instanceId: string
    projectPath: string
    filePath: string
    ref: string
    line?: number
  }) => ipcRenderer.invoke('gitlab:buildWebUrl', data),
  gitlabBuildProjectUrl: (data: {
    instanceId: string
    projectPath: string
  }) => ipcRenderer.invoke('gitlab:buildProjectUrl', data),
  gitlabGetSettings: () => ipcRenderer.invoke('gitlab:getSettings'),
  gitlabUpdateSettings: (settings: unknown) =>
    ipcRenderer.invoke('gitlab:updateSettings', settings),

  // ===== Clipboard =====
  clipboardWrite: (text: string) => ipcRenderer.invoke('clipboard:write', text)
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
