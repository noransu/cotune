import { ipcMain } from 'electron'
import Store from 'electron-store'

export interface Workspace {
  id: string
  name: string
  path: string
}

interface StoreSchema {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
}

const store = new Store<StoreSchema>({
  name: 'cotune-workspaces',
  defaults: {
    workspaces: [],
    activeWorkspaceId: null
  }
})

export function registerWorkspaceHandlers(): void {
  ipcMain.handle('workspace:list', () => store.get('workspaces'))

  ipcMain.handle('workspace:getActive', () => store.get('activeWorkspaceId'))

  ipcMain.handle('workspace:setActive', (_event, id: string) => {
    store.set('activeWorkspaceId', id)
    return true
  })

  ipcMain.handle('workspace:create', (_event, ws: Workspace) => {
    const list = store.get('workspaces')
    list.push(ws)
    store.set('workspaces', list)
    return ws
  })

  ipcMain.handle('workspace:update', (_event, ws: Workspace) => {
    const list = store.get('workspaces')
    const idx = list.findIndex((w) => w.id === ws.id)
    if (idx >= 0) {
      list[idx] = ws
      store.set('workspaces', list)
    }
    return ws
  })

  ipcMain.handle('workspace:delete', (_event, id: string) => {
    store.set(
      'workspaces',
      store.get('workspaces').filter((w) => w.id !== id)
    )
    const activeId = store.get('activeWorkspaceId')
    if (activeId === id) store.set('activeWorkspaceId', null)
    return true
  })
}
