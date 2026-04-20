import { ipcMain, dialog } from 'electron'
import Store from 'electron-store'
import { existsSync, readFileSync } from 'fs'
import { join, basename } from 'path'

export interface ProjectConfig {
  id: string
  name: string
  frontend?: {
    path: string
    command: string
    port: number
  }
  backend?: {
    path: string
    command: string
    port: number
    framework: 'spring-boot' | 'express' | 'other'
  }
  proxyPort: number
  status: 'stopped' | 'running' | 'error'
}

interface StoreSchema {
  projects: ProjectConfig[]
  activeProjectId: string | null
}

const store = new Store<StoreSchema>({
  name: 'cotune-projects',
  defaults: {
    projects: [],
    activeProjectId: null
  }
})

export function registerProjectHandlers(): void {
  ipcMain.handle('project:list', () => store.get('projects'))
  ipcMain.handle('project:getActive', () => store.get('activeProjectId'))

  ipcMain.handle('project:setActive', (_event, projectId: string) => {
    store.set('activeProjectId', projectId)
    return true
  })

  ipcMain.handle('project:create', (_event, project: ProjectConfig) => {
    const projects = store.get('projects')
    projects.push(project)
    store.set('projects', projects)
    return project
  })

  ipcMain.handle('project:update', (_event, project: ProjectConfig) => {
    const projects = store.get('projects')
    const index = projects.findIndex((p) => p.id === project.id)
    if (index >= 0) {
      projects[index] = project
      store.set('projects', projects)
    }
    return project
  })

  ipcMain.handle('project:delete', (_event, projectId: string) => {
    const projects = store.get('projects')
    store.set(
      'projects',
      projects.filter((p) => p.id !== projectId)
    )
    const activeId = store.get('activeProjectId')
    if (activeId === projectId) store.set('activeProjectId', null)
    return true
  })

  ipcMain.handle('project:selectDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Project Directory'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ===== Enhanced detection: returns full config with auto-detected port =====

  ipcMain.handle('project:detectFrontend', async (_event, dirPath: string) => {
    const result = {
      tool: 'unknown',
      command: 'npm run dev',
      port: 5173, // vite default
      name: basename(dirPath)
    }

    // Vite
    for (const cfg of ['vite.config.ts', 'vite.config.js', 'vite.config.mts']) {
      const cfgPath = join(dirPath, cfg)
      if (existsSync(cfgPath)) {
        result.tool = 'vite'
        result.command = 'npm run dev'
        result.port = readPortFromViteConfig(cfgPath) || 5173
        return result
      }
    }

    // Next.js
    for (const cfg of ['next.config.js', 'next.config.ts', 'next.config.mjs']) {
      if (existsSync(join(dirPath, cfg))) {
        result.tool = 'next'
        result.command = 'npm run dev'
        result.port = 3000
        return result
      }
    }

    // Nuxt
    for (const cfg of ['nuxt.config.ts', 'nuxt.config.js']) {
      if (existsSync(join(dirPath, cfg))) {
        result.tool = 'nuxt'
        result.command = 'npm run dev'
        result.port = 3000
        return result
      }
    }

    // Vue CLI
    if (existsSync(join(dirPath, 'vue.config.js'))) {
      result.tool = 'vue-cli'
      result.command = 'npm run serve'
      result.port = 8080
      return result
    }

    // Angular
    if (existsSync(join(dirPath, 'angular.json'))) {
      result.tool = 'angular'
      result.command = 'npm start'
      result.port = 4200
      return result
    }

    // Fallback: read package.json scripts & look for port in scripts
    const pkgPath = join(dirPath, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
        if (pkg.scripts?.dev) {
          result.command = 'npm run dev'
          // Try to extract port from script: e.g. "vite --port 3000"
          const portMatch = pkg.scripts.dev.match(/--port\s+(\d+)/)
          if (portMatch) result.port = parseInt(portMatch[1])
        } else if (pkg.scripts?.start) {
          result.command = 'npm start'
        }
      } catch { /* ignore */ }
    }

    return result
  })

  // Detect single backend (returns one service)
  ipcMain.handle('project:detectBackend', async (_event, dirPath: string) => {
    return detectSingleBackend(dirPath)
  })

  // Auto-detect ALL backend entry points (returns array)
  ipcMain.handle('project:detectBackendEntries', async (_event, dirPath: string) => {
    return detectAllBackendEntries(dirPath)
  })
}

/** Read port from vite.config.ts/js */
function readPortFromViteConfig(configPath: string): number | null {
  try {
    const content = readFileSync(configPath, 'utf-8')
    const match = content.match(/port\s*:\s*(\d+)/)
    if (match) return parseInt(match[1])
  } catch { /* ignore */ }
  return null
}

/** Read port from Spring Boot application.properties or application.yml */
function readSpringBootPort(dirPath: string): number | null {
  // application.properties
  const propsPath = join(dirPath, 'src/main/resources/application.properties')
  if (existsSync(propsPath)) {
    try {
      const content = readFileSync(propsPath, 'utf-8')
      const match = content.match(/server\.port\s*=\s*(\d+)/)
      if (match) return parseInt(match[1])
    } catch { /* ignore */ }
  }
  // application.yml / application.yaml
  for (const ymlName of ['application.yml', 'application.yaml']) {
    const ymlPath = join(dirPath, 'src/main/resources', ymlName)
    if (existsSync(ymlPath)) {
      try {
        const content = readFileSync(ymlPath, 'utf-8')
        const match = content.match(/port\s*:\s*(\d+)/)
        if (match) return parseInt(match[1])
      } catch { /* ignore */ }
    }
  }
  return null
}

// ===== Backend detection logic =====

interface DetectedBackend {
  framework: 'spring-boot' | 'express' | 'other'
  command: string
  port: number
  name: string
}

function detectSingleBackend(dirPath: string): DetectedBackend {
  const result: DetectedBackend = {
    framework: 'other', command: '', port: 8080, name: basename(dirPath)
  }

  if (existsSync(join(dirPath, 'pom.xml'))) {
    const hasMvnw = existsSync(join(dirPath, 'mvnw'))
    result.framework = 'spring-boot'
    result.command = hasMvnw ? './mvnw spring-boot:run' : 'mvn spring-boot:run'
    result.port = readSpringBootPort(dirPath) || 8080
    return result
  }
  if (existsSync(join(dirPath, 'build.gradle')) || existsSync(join(dirPath, 'build.gradle.kts'))) {
    const hasGradlew = existsSync(join(dirPath, 'gradlew'))
    result.framework = 'spring-boot'
    result.command = hasGradlew ? './gradlew bootRun' : 'gradle bootRun'
    result.port = readSpringBootPort(dirPath) || 8080
    return result
  }
  const pkgPath = join(dirPath, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps['express'] || deps['koa'] || deps['fastify'] || deps['nest']) {
        result.framework = 'express'
        result.command = pkg.scripts?.dev ? 'npm run dev' : 'npm start'
        const envPath = join(dirPath, '.env')
        if (existsSync(envPath)) {
          const m = readFileSync(envPath, 'utf-8').match(/PORT\s*=\s*(\d+)/)
          if (m) result.port = parseInt(m[1])
        }
        return result
      }
    } catch { /* ignore */ }
  }
  return result
}

/**
 * Auto-detect ALL backend entry points.
 * Checks multi-module Maven/Gradle and multiple @SpringBootApplication classes.
 */
function detectAllBackendEntries(dirPath: string): DetectedBackend[] {
  const entries: DetectedBackend[] = []

  // Multi-module Maven
  if (existsSync(join(dirPath, 'pom.xml'))) {
    const subModules = findSubModules(dirPath)
    if (subModules.length > 1) {
      for (const mod of subModules) {
        if (hasSpringBootMain(mod.path)) {
          const mvn = existsSync(join(dirPath, 'mvnw')) ? './mvnw' : 'mvn'
          entries.push({
            framework: 'spring-boot', name: mod.name,
            command: `${mvn} spring-boot:run -pl ${mod.name} -am`,
            port: readSpringBootPort(mod.path) || (8080 + entries.length)
          })
        }
      }
      if (entries.length > 0) return entries
    }
    // Single module, multiple main classes
    const mainClasses = findSpringBootMainClasses(dirPath)
    if (mainClasses.length > 1) {
      const mvn = existsSync(join(dirPath, 'mvnw')) ? './mvnw' : 'mvn'
      for (let i = 0; i < mainClasses.length; i++) {
        entries.push({
          framework: 'spring-boot', name: mainClasses[i].className,
          command: `${mvn} spring-boot:run -Dspring-boot.run.main-class=${mainClasses[i].fqcn}`,
          port: readSpringBootPort(dirPath) || (8080 + i)
        })
      }
      return entries
    }
  }

  // Multi-module Gradle
  if (existsSync(join(dirPath, 'settings.gradle')) || existsSync(join(dirPath, 'settings.gradle.kts'))) {
    const subModules = findGradleSubModules(dirPath)
    for (const mod of subModules) {
      if (hasSpringBootMain(mod.path)) {
        const gradle = existsSync(join(dirPath, 'gradlew')) ? './gradlew' : 'gradle'
        entries.push({
          framework: 'spring-boot', name: mod.name,
          command: `${gradle} :${mod.name}:bootRun`,
          port: readSpringBootPort(mod.path) || (8080 + entries.length)
        })
      }
    }
    if (entries.length > 0) return entries
  }

  // Fallback
  const single = detectSingleBackend(dirPath)
  if (single.command) entries.push(single)
  return entries
}

function findSubModules(rootDir: string): Array<{ name: string; path: string }> {
  const results: Array<{ name: string; path: string }> = []
  try {
    const fs = require('fs')
    for (const entry of fs.readdirSync(rootDir) as string[]) {
      if (entry.startsWith('.') || entry === 'node_modules' || entry === 'target') continue
      const p = join(rootDir, entry)
      if (fs.statSync(p).isDirectory() && existsSync(join(p, 'pom.xml')))
        results.push({ name: entry, path: p })
    }
  } catch { /* ignore */ }
  return results
}

function findGradleSubModules(rootDir: string): Array<{ name: string; path: string }> {
  for (const f of ['settings.gradle', 'settings.gradle.kts']) {
    const p = join(rootDir, f)
    if (!existsSync(p)) continue
    try {
      const content = readFileSync(p, 'utf-8')
      const results: Array<{ name: string; path: string }> = []
      const regex = /include\s*\(?['":]+([^'":\s)]+)/g
      let m: RegExpExecArray | null
      while ((m = regex.exec(content)) !== null) {
        const modPath = join(rootDir, m[1])
        if (existsSync(modPath)) results.push({ name: m[1], path: modPath })
      }
      return results
    } catch { /* ignore */ }
  }
  return []
}

function hasSpringBootMain(dirPath: string): boolean {
  const srcDir = join(dirPath, 'src', 'main', 'java')
  if (!existsSync(srcDir)) return false
  return scanDir(srcDir, '@SpringBootApplication')
}

function scanDir(dir: string, keyword: string): boolean {
  try {
    const fs = require('fs')
    for (const entry of fs.readdirSync(dir) as string[]) {
      const p = join(dir, entry)
      const stat = fs.statSync(p)
      if (stat.isDirectory()) { if (scanDir(p, keyword)) return true }
      else if (entry.endsWith('.java') && readFileSync(p, 'utf-8').includes(keyword)) return true
    }
  } catch { /* ignore */ }
  return false
}

function findSpringBootMainClasses(dirPath: string): Array<{ className: string; fqcn: string }> {
  const results: Array<{ className: string; fqcn: string }> = []
  const srcDir = join(dirPath, 'src', 'main', 'java')
  if (!existsSync(srcDir)) return results
  collectMainClasses(srcDir, results)
  return results
}

function collectMainClasses(dir: string, out: Array<{ className: string; fqcn: string }>): void {
  try {
    const fs = require('fs')
    for (const entry of fs.readdirSync(dir) as string[]) {
      const p = join(dir, entry)
      const stat = fs.statSync(p)
      if (stat.isDirectory()) { collectMainClasses(p, out) }
      else if (entry.endsWith('.java')) {
        const content = readFileSync(p, 'utf-8')
        if (content.includes('@SpringBootApplication')) {
          const pkgM = content.match(/package\s+([\w.]+)/)
          const clsM = content.match(/class\s+(\w+)/)
          if (pkgM && clsM) out.push({ className: clsM[1], fqcn: `${pkgM[1]}.${clsM[1]}` })
        }
      }
    }
  } catch { /* ignore */ }
}
