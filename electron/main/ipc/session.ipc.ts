import { ipcMain } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { homedir } from 'os'

function getDbPath(): string {
  return join(homedir(), '.local', 'share', 'codemaker', 'opencode.db')
}

export function registerSessionHandlers(): void {
  // List sessions for one or more project directories
  ipcMain.handle(
    'session:list',
    async (
      _event,
      { directories, limit }: { directories?: string[]; limit?: number }
    ) => {
      try {
        const Database = (await import('better-sqlite3')).default
        const dbPath = getDbPath()

        if (!existsSync(dbPath)) {
          return []
        }

        const db = new Database(dbPath, { readonly: true })
        const maxResults = limit || 50

        if (directories && directories.length > 0) {
          // Query sessions matching ANY of the given directories
          const placeholders = directories.map(() => '?').join(', ')
          const query = `
            SELECT s.id, s.title, s.slug, s.directory, s.project_id as projectId,
                   s.time_created as timeCreated, s.time_updated as timeUpdated
            FROM session s
            WHERE s.directory IN (${placeholders})
            ORDER BY s.time_updated DESC
            LIMIT ?
          `
          const sessions = db.prepare(query).all(...directories, maxResults)
          db.close()
          return sessions
        } else {
          const query = `
            SELECT s.id, s.title, s.slug, s.directory, s.project_id as projectId,
                   s.time_created as timeCreated, s.time_updated as timeUpdated
            FROM session s
            ORDER BY s.time_updated DESC
            LIMIT ?
          `
          const sessions = db.prepare(query).all(maxResults)
          db.close()
          return sessions
        }
      } catch (error) {
        console.error('Failed to read sessions:', error)
        return []
      }
    }
  )

  // Get text parts for a session (for preview)
  ipcMain.handle(
    'session:getParts',
    async (
      _event,
      { sessionId, types, limit }: { sessionId: string; types?: string[]; limit?: number }
    ) => {
      try {
        const Database = (await import('better-sqlite3')).default
        const dbPath = getDbPath()
        if (!existsSync(dbPath)) return []

        const db = new Database(dbPath, { readonly: true })

        // Join message to get role info, then get parts
        const rows = db
          .prepare(
            `
            SELECT p.id, p.message_id as messageId, p.session_id as sessionId,
                   p.time_created as timeCreated, p.data,
                   m.data as messageData
            FROM part p
            JOIN message m ON m.id = p.message_id
            WHERE p.session_id = ?
            ORDER BY p.time_created ASC
            LIMIT ?
          `
          )
          .all(sessionId, limit || 200) as Array<{
          id: string
          messageId: string
          sessionId: string
          timeCreated: number
          data: string
          messageData: string
        }>

        const filterTypes = types || ['text']

        const parsed = rows
          .map((row) => {
            try {
              const partData = JSON.parse(row.data)
              if (!filterTypes.includes(partData.type)) return null
              // Extract role from message data
              let role = 'unknown'
              try {
                const msgData = JSON.parse(row.messageData)
                role = msgData.role || 'unknown'
              } catch { /* ignore */ }

              return {
                id: row.id,
                messageId: row.messageId,
                sessionId: row.sessionId,
                timeCreated: row.timeCreated,
                type: partData.type,
                text: partData.text || '',
                role
              }
            } catch {
              return null
            }
          })
          .filter(Boolean)

        db.close()
        return parsed
      } catch (error) {
        console.error('Failed to read parts:', error)
        return []
      }
    }
  )

  // Check if CodeMaker DB exists
  ipcMain.handle('session:dbExists', () => {
    return existsSync(getDbPath())
  })
}
