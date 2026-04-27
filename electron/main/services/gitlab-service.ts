import https from 'https'
import http from 'http'
import { URL } from 'url'

// ===== Types =====

export interface GitLabInstance {
  id: string
  name: string
  url: string          // e.g. https://gitlab.internal.com
  token: string        // Personal Access Token
  avatarUrl?: string
  username?: string
}

export interface GitLabUser {
  id: number
  username: string
  name: string
  avatar_url: string
  web_url: string
}

export interface GitLabGroup {
  id: number
  name: string
  full_path: string
  description: string
  web_url: string
  avatar_url: string | null
}

export interface GitLabProject {
  id: number
  name: string
  name_with_namespace: string
  path_with_namespace: string
  web_url: string
  default_branch: string
  description: string | null
  avatar_url: string | null
}

export interface BlobSearchResult {
  basename: string
  data: string
  path: string
  filename: string
  id: string | null
  ref: string
  startline: number
  project_id: number
}

export interface CommitSearchResult {
  id: string
  short_id: string
  title: string
  message: string
  author_name: string
  author_email: string
  authored_date: string
  committed_date: string
  project_id: number
  web_url: string
}

export interface ProjectSearchResult {
  id: number
  name: string
  name_with_namespace: string
  path_with_namespace: string
  description: string | null
  web_url: string
  default_branch: string
  star_count: number
  forks_count: number
  last_activity_at: string
  avatar_url: string | null
}

export type SearchScope = 'blobs' | 'projects' | 'commits'

export interface SearchParams {
  instanceId: string
  scope: SearchScope
  query: string
  groupId?: number
  page?: number
  perPage?: number
}

export interface SearchResponse<T> {
  items: T[]
  total: number
  page: number
  perPage: number
  hasMore: boolean
}

// ===== HTTP Client =====

interface ApiResponse {
  data: any
  headers: Record<string, string | string[] | undefined>
  status: number
}

function request(
  baseUrl: string,
  path: string,
  token: string,
  params: Record<string, string | number | undefined> = {}
): Promise<ApiResponse> {
  return new Promise((resolve, reject) => {
    const fullUrlStr = baseUrl.replace(/\/+$/, '') + path
    const url = new URL(fullUrlStr)
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }

    console.log(`[GitLab] GET ${url.toString()}`)

    const isHttps = url.protocol === 'https:'
    const client = isHttps ? https : http

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'PRIVATE-TOKEN': token,
        'Accept': 'application/json',
        'User-Agent': 'CoTune/1.0'
      },
      rejectUnauthorized: false
    }

    const req = client.request(options, (res) => {
      let body = ''
      res.on('data', (chunk: Buffer) => { body += chunk.toString() })
      res.on('end', () => {
        try {
          const data = body ? JSON.parse(body) : null
          if (res.statusCode && res.statusCode >= 400) {
            const errMsg = typeof data?.message === 'string'
              ? data.message
              : typeof data?.error === 'string'
                ? data.error
                : JSON.stringify(data)
            console.error(`[GitLab] ${res.statusCode} ${url.pathname}: ${errMsg}`)
          }
          resolve({
            data,
            headers: res.headers as Record<string, string | string[] | undefined>,
            status: res.statusCode || 0
          })
        } catch {
          reject(new Error(`Failed to parse response: ${body.substring(0, 300)}`))
        }
      })
    })

    req.on('error', (err) => {
      console.error(`[GitLab] Request error: ${err.message}`)
      reject(err)
    })
    req.setTimeout(30000, () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })
    req.end()
  })
}

// ===== GitLab Service =====

export class GitLabService {
  private instances: Map<string, GitLabInstance> = new Map()
  private projectCache: Map<string, { path: string; name: string }> = new Map()
  // Cache accessible projects per instance (for CE fallback search)
  private accessibleProjectsCache: Map<string, { projects: GitLabProject[]; fetchedAt: number }> = new Map()

  // --- Instance management ---

  addInstance(instance: GitLabInstance): void {
    instance.url = instance.url.replace(/\/+$/, '')
    this.instances.set(instance.id, instance)
  }

  removeInstance(id: string): void {
    this.instances.delete(id)
    this.accessibleProjectsCache.delete(id)
  }

  getInstance(id: string): GitLabInstance | undefined {
    return this.instances.get(id)
  }

  getAllInstances(): GitLabInstance[] {
    return Array.from(this.instances.values())
  }

  loadInstances(instances: GitLabInstance[]): void {
    this.instances.clear()
    for (const inst of instances) {
      inst.url = inst.url.replace(/\/+$/, '')
      this.instances.set(inst.id, inst)
    }
  }

  // --- API methods ---

  async validateToken(url: string, token: string): Promise<GitLabUser> {
    const normalizedUrl = url.replace(/\/+$/, '')
    const res = await request(normalizedUrl, '/api/v4/user', token)
    if (res.status === 401) throw new Error('Invalid token: authentication failed')
    if (res.status !== 200) throw new Error(`GitLab API error: ${res.status}`)
    return res.data
  }

  async getGroups(instanceId: string): Promise<GitLabGroup[]> {
    const inst = this.requireInstance(instanceId)
    const groups: GitLabGroup[] = []
    let page = 1
    while (page <= 10) {
      const res = await request(inst.url, '/api/v4/groups', inst.token, {
        per_page: 100,
        page,
        order_by: 'name',
        sort: 'asc'
      })
      if (res.status !== 200) throw new Error(`Failed to fetch groups: ${res.status}`)
      if (!Array.isArray(res.data) || res.data.length === 0) break
      groups.push(...res.data)
      const nextPage = res.headers['x-next-page']
      if (!nextPage || nextPage === '') break
      page++
    }
    return groups
  }

  // --- Search (main entry point) ---

  async search<T>(params: SearchParams): Promise<SearchResponse<T>> {
    const inst = this.requireInstance(params.instanceId)
    const page = params.page || 1
    const perPage = params.perPage || 20

    // Build endpoint: global vs group-level search
    const endpoint = params.groupId
      ? `/api/v4/groups/${params.groupId}/search`
      : '/api/v4/search'

    const res = await request(inst.url, endpoint, inst.token, {
      scope: params.scope,
      search: params.query,
      page,
      per_page: perPage
    })

    // GitLab CE returns 400 for blobs/commits at global/group level (needs Advanced Search)
    // Fall back to project-level batch search
    if (res.status === 400 && (params.scope === 'blobs' || params.scope === 'commits')) {
      console.log(`[GitLab] Global/group ${params.scope} search not available (CE), falling back to project-level batch search`)
      return this.batchProjectSearch<T>(params)
    }

    if (res.status !== 200) {
      const errDetail = typeof res.data?.message === 'string'
        ? res.data.message
        : typeof res.data?.error === 'string'
          ? res.data.error
          : JSON.stringify(res.data)
      throw new Error(`Search failed (${res.status}): ${errDetail}`)
    }

    const items = Array.isArray(res.data) ? res.data : []
    const total = parseInt(String(res.headers['x-total'] || '0'), 10)
    const nextPage = res.headers['x-next-page']

    console.log(`[GitLab] Search scope=${params.scope} query="${params.query}" => ${items.length} items, total=${total}`)

    return {
      items,
      total: total || items.length,
      page,
      perPage,
      hasMore: !!(nextPage && nextPage !== '')
    }
  }

  // --- CE Fallback: search across projects in batches ---

  private async batchProjectSearch<T>(params: SearchParams): Promise<SearchResponse<T>> {
    const inst = this.requireInstance(params.instanceId)
    const perPage = params.perPage || 20

    // Get all accessible projects (cached for 5 minutes)
    const projects = await this.getAccessibleProjects(params.instanceId, params.groupId)
    if (projects.length === 0) {
      console.log('[GitLab] No accessible projects found for batch search')
      return { items: [], total: 0, page: 1, perPage, hasMore: false }
    }

    console.log(`[GitLab] Batch searching ${projects.length} projects for scope=${params.scope} query="${params.query}"`)

    const allItems: any[] = []
    const BATCH_SIZE = 8 // concurrent requests

    for (let i = 0; i < projects.length; i += BATCH_SIZE) {
      const batch = projects.slice(i, i + BATCH_SIZE)

      const batchResults = await Promise.allSettled(
        batch.map(async (proj) => {
          const res = await request(
            inst.url,
            `/api/v4/projects/${proj.id}/search`,
            inst.token,
            {
              scope: params.scope,
              search: params.query,
              per_page: 10 // limit per project
            }
          )
          if (res.status === 200 && Array.isArray(res.data)) {
            // Enrich each result with project info
            return res.data.map((item: any) => ({
              ...item,
              project_id: item.project_id || proj.id,
              _projectPath: proj.path_with_namespace,
              _projectName: proj.name_with_namespace
            }))
          }
          return []
        })
      )

      for (const res of batchResults) {
        if (res.status === 'fulfilled' && res.value.length > 0) {
          allItems.push(...res.value)
        }
      }

      // Stop early if we have plenty of results
      if (allItems.length >= perPage * 3) break
    }

    console.log(`[GitLab] Batch search found ${allItems.length} results across projects`)

    // Return paginated slice
    const page = params.page || 1
    const startIdx = (page - 1) * perPage
    const pageItems = allItems.slice(startIdx, startIdx + perPage)

    return {
      items: pageItems as T[],
      total: allItems.length,
      page,
      perPage,
      hasMore: startIdx + perPage < allItems.length
    }
  }

  // Fetch and cache all accessible projects for an instance
  private async getAccessibleProjects(instanceId: string, groupId?: number): Promise<GitLabProject[]> {
    const cacheKey = groupId ? `${instanceId}:group:${groupId}` : instanceId
    const cached = this.accessibleProjectsCache.get(cacheKey)
    // Cache for 5 minutes
    if (cached && Date.now() - cached.fetchedAt < 5 * 60 * 1000) {
      console.log(`[GitLab] Using cached project list (${cached.projects.length} projects)`)
      return cached.projects
    }

    const inst = this.requireInstance(instanceId)
    const projects: GitLabProject[] = []
    let page = 1
    const maxPages = 10 // up to 1000 projects (100 per page)

    while (page <= maxPages) {
      const endpoint = groupId
        ? `/api/v4/groups/${groupId}/projects`
        : '/api/v4/projects'

      const res = await request(inst.url, endpoint, inst.token, {
        membership: groupId ? undefined : 'true', // only projects user is a member of (for global)
        per_page: 100,
        page,
        order_by: 'last_activity_at',
        sort: 'desc',
        simple: 'true'
      })

      if (res.status !== 200 || !Array.isArray(res.data) || res.data.length === 0) break
      projects.push(...res.data)
      const nextPage = res.headers['x-next-page']
      if (!nextPage || nextPage === '') break
      page++
    }

    console.log(`[GitLab] Fetched ${projects.length} accessible projects`)
    this.accessibleProjectsCache.set(cacheKey, { projects, fetchedAt: Date.now() })

    // Also populate projectCache for enrichment
    for (const proj of projects) {
      this.projectCache.set(`${instanceId}:${proj.id}`, {
        path: proj.path_with_namespace,
        name: proj.name_with_namespace || proj.name
      })
    }

    return projects
  }

  // --- File content ---

  async getFileContent(
    instanceId: string,
    projectId: number,
    filePath: string,
    ref: string
  ): Promise<string> {
    const inst = this.requireInstance(instanceId)
    const encodedPath = encodeURIComponent(filePath)
    const res = await request(
      inst.url,
      `/api/v4/projects/${projectId}/repository/files/${encodedPath}/raw`,
      inst.token,
      { ref }
    )
    if (res.status !== 200) {
      throw new Error(`Failed to fetch file: ${res.status}`)
    }
    return typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2)
  }

  async getFileRaw(
    instanceId: string,
    projectId: number,
    filePath: string,
    ref: string
  ): Promise<string> {
    const inst = this.requireInstance(instanceId)
    const encodedPath = encodeURIComponent(filePath)
    const normalizedUrl = inst.url.replace(/\/+$/, '')
    const fullUrlStr = `${normalizedUrl}/api/v4/projects/${projectId}/repository/files/${encodedPath}/raw`
    const url = new URL(fullUrlStr)
    url.searchParams.set('ref', ref)

    return new Promise((resolve, reject) => {
      const isHttps = url.protocol === 'https:'
      const client = isHttps ? https : http

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'PRIVATE-TOKEN': inst.token,
          'User-Agent': 'CoTune/1.0'
        },
        rejectUnauthorized: false
      }

      const req = client.request(options, (res) => {
        let body = ''
        res.on('data', (chunk: Buffer) => { body += chunk.toString() })
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Failed to fetch file: ${res.statusCode}`))
            return
          }
          resolve(body)
        })
      })
      req.on('error', reject)
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')) })
      req.end()
    })
  }

  // --- URL builders ---

  buildWebUrl(
    instanceId: string,
    projectPath: string,
    filePath: string,
    ref: string,
    line?: number
  ): string {
    const inst = this.requireInstance(instanceId)
    let url = `${inst.url}/${projectPath}/-/blob/${ref}/${filePath}`
    if (line) url += `#L${line}`
    return url
  }

  buildProjectWebUrl(instanceId: string, projectPath: string): string {
    const inst = this.requireInstance(instanceId)
    return `${inst.url}/${projectPath}`
  }

  buildCommitWebUrl(instanceId: string, projectPath: string, commitId: string): string {
    const inst = this.requireInstance(instanceId)
    return `${inst.url}/${projectPath}/-/commit/${commitId}`
  }

  // --- Helpers ---

  private requireInstance(id: string): GitLabInstance {
    const inst = this.instances.get(id)
    if (!inst) throw new Error(`GitLab instance not found: ${id}`)
    return inst
  }

  async getProjectInfo(instanceId: string, projectId: number): Promise<{ path: string; name: string }> {
    const cacheKey = `${instanceId}:${projectId}`
    const cached = this.projectCache.get(cacheKey)
    if (cached) return cached

    const inst = this.requireInstance(instanceId)
    try {
      const res = await request(inst.url, `/api/v4/projects/${projectId}`, inst.token, {
        simple: 'true'
      })
      if (res.status === 200 && res.data) {
        const info = {
          path: res.data.path_with_namespace || '',
          name: res.data.name_with_namespace || res.data.name || ''
        }
        this.projectCache.set(cacheKey, info)
        return info
      }
    } catch { /* ignore */ }
    return { path: '', name: `Project #${projectId}` }
  }

  async enrichWithProjectInfo(
    instanceId: string,
    items: Array<{ project_id: number; _projectPath?: string; _projectName?: string }>
  ): Promise<void> {
    // Skip items that already have project info (from batch search)
    const needsEnrich = items.filter((i) => !i._projectPath)
    if (needsEnrich.length === 0) return

    const uniqueIds = [...new Set(needsEnrich.map((i) => i.project_id))]
    const infoMap = new Map<number, { path: string; name: string }>()

    await Promise.all(
      uniqueIds.map(async (pid) => {
        const info = await this.getProjectInfo(instanceId, pid)
        infoMap.set(pid, info)
      })
    )

    for (const item of needsEnrich) {
      const info = infoMap.get(item.project_id)
      if (info) {
        item._projectPath = info.path
        item._projectName = info.name
      }
    }
  }
}
