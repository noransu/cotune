import { ipcMain } from 'electron'
import Store from 'electron-store'
import {
  GitLabService,
  GitLabInstance,
  SearchParams,
  SearchScope
} from '../services/gitlab-service'

interface GitLabStoreSchema {
  instances: GitLabInstance[]
  settings: {
    lastActiveInstanceId: string | null
    lastScope: SearchScope
  }
}

const store = new Store<GitLabStoreSchema>({
  name: 'cotune-gitlab',
  defaults: {
    instances: [],
    settings: {
      lastActiveInstanceId: null,
      lastScope: 'blobs'
    }
  }
})

const gitlabService = new GitLabService()

// Load persisted instances into the service on startup
const persistedInstances = store.get('instances')
if (persistedInstances.length > 0) {
  gitlabService.loadInstances(persistedInstances)
}

export function registerGitLabHandlers(): void {
  // ===== Instance management =====

  ipcMain.handle('gitlab:getInstances', () => {
    return store.get('instances')
  })

  ipcMain.handle('gitlab:addInstance', async (_event, data: {
    name: string
    url: string
    token: string
  }) => {
    // Validate token first
    const user = await gitlabService.validateToken(data.url, data.token)
    const instance: GitLabInstance = {
      id: `gitlab-${Date.now()}`,
      name: data.name,
      url: data.url.replace(/\/+$/, ''),
      token: data.token,
      username: user.username,
      avatarUrl: user.avatar_url
    }

    gitlabService.addInstance(instance)
    const instances = store.get('instances')
    instances.push(instance)
    store.set('instances', instances)

    return instance
  })

  ipcMain.handle('gitlab:updateInstance', (_event, instance: GitLabInstance) => {
    gitlabService.addInstance(instance) // addInstance also updates
    const instances = store.get('instances')
    const idx = instances.findIndex((i) => i.id === instance.id)
    if (idx >= 0) {
      instances[idx] = instance
      store.set('instances', instances)
    }
    return instance
  })

  ipcMain.handle('gitlab:removeInstance', (_event, id: string) => {
    gitlabService.removeInstance(id)
    const instances = store.get('instances')
    store.set('instances', instances.filter((i) => i.id !== id))
    return true
  })

  ipcMain.handle('gitlab:validateToken', async (_event, data: {
    url: string
    token: string
  }) => {
    return await gitlabService.validateToken(data.url, data.token)
  })

  // ===== Groups =====

  ipcMain.handle('gitlab:getGroups', async (_event, instanceId: string) => {
    return await gitlabService.getGroups(instanceId)
  })

  // ===== Search =====

  ipcMain.handle('gitlab:search', async (_event, params: SearchParams) => {
    const result = await gitlabService.search(params)

    // Enrich blobs and commits with project path/name
    if ((params.scope === 'blobs' || params.scope === 'commits') && result.items.length > 0) {
      await gitlabService.enrichWithProjectInfo(params.instanceId, result.items as any[])
    }

    return result
  })

  // ===== File content (for preview) =====

  ipcMain.handle('gitlab:getFileContent', async (_event, data: {
    instanceId: string
    projectId: number
    filePath: string
    ref: string
  }) => {
    return await gitlabService.getFileRaw(
      data.instanceId,
      data.projectId,
      data.filePath,
      data.ref
    )
  })

  // ===== URL builders =====

  ipcMain.handle('gitlab:buildWebUrl', (_event, data: {
    instanceId: string
    projectPath: string
    filePath: string
    ref: string
    line?: number
  }) => {
    return gitlabService.buildWebUrl(
      data.instanceId,
      data.projectPath,
      data.filePath,
      data.ref,
      data.line
    )
  })

  ipcMain.handle('gitlab:buildProjectUrl', (_event, data: {
    instanceId: string
    projectPath: string
  }) => {
    return gitlabService.buildProjectWebUrl(data.instanceId, data.projectPath)
  })

  // ===== Settings =====

  ipcMain.handle('gitlab:getSettings', () => {
    return store.get('settings')
  })

  ipcMain.handle('gitlab:updateSettings', (_event, settings: GitLabStoreSchema['settings']) => {
    store.set('settings', settings)
    return settings
  })
}
