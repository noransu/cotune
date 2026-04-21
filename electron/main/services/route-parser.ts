import { readFileSync, existsSync } from 'fs'
import { join, relative } from 'path'
import { glob } from 'glob'

export interface ParsedRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | '*'
  path: string
  className: string
  methodName: string
  sourceFile: string
  lineNumber: number
}

// Annotation → HTTP method mapping
const METHOD_ANNOTATIONS: Record<string, ParsedRoute['method']> = {
  GetMapping: 'GET',
  PostMapping: 'POST',
  PutMapping: 'PUT',
  DeleteMapping: 'DELETE',
  PatchMapping: 'PATCH',
  RequestMapping: '*'
}

/**
 * Parse Spring Boot project to extract all REST API routes.
 * Also attempts to detect the context-path from config files.
 */
export async function parseSpringBootRoutes(
  projectPath: string
): Promise<{ routes: ParsedRoute[]; contextPath: string }> {
  const routes: ParsedRoute[] = []

  // Find all Java files
  const javaFiles = await glob('**/src/main/java/**/*.java', {
    cwd: projectPath,
    absolute: true
  })

  for (const filePath of javaFiles) {
    try {
      const content = readFileSync(filePath, 'utf-8')
      const fileRoutes = parseJavaFile(content, filePath, projectPath)
      routes.push(...fileRoutes)
    } catch {
      // Skip files that can't be read
    }
  }

  const contextPath = detectContextPath(projectPath)

  return { routes, contextPath }
}

function parseJavaFile(
  content: string,
  filePath: string,
  projectPath: string
): ParsedRoute[] {
  const routes: ParsedRoute[] = []

  // Check if this is a Controller class
  const isController =
    content.includes('@RestController') || content.includes('@Controller')
  if (!isController) return routes

  // Extract class name
  const classNameMatch = content.match(/class\s+(\w+)/)
  const className = classNameMatch ? classNameMatch[1] : 'Unknown'

  // Extract class-level @RequestMapping prefix
  const classPrefix = extractClassLevelPath(content)

  // Pre-process: join multi-line annotations into single lines for easier parsing.
  // Java annotations like @PostMapping(\n  value = "/path",\n  produces = ...\n)
  // need to be collapsed into one logical line.
  const lines = content.split('\n')
  const mergedLines: { text: string; lineNumber: number }[] = []
  let buffer = ''
  let parenDepth = 0
  let bufferStart = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (buffer) {
      buffer += ' ' + line.trim()
      for (const ch of line) {
        if (ch === '(') parenDepth++
        else if (ch === ')') parenDepth--
      }
      if (parenDepth <= 0) {
        mergedLines.push({ text: buffer.trim(), lineNumber: bufferStart + 1 })
        buffer = ''
        parenDepth = 0
      }
    } else {
      const trimmed = line.trim()
      // Detect start of a mapping annotation
      const isAnnotationStart = /^@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\s*(\(|$)/.test(trimmed)
      if (isAnnotationStart) {
        parenDepth = 0
        for (const ch of trimmed) {
          if (ch === '(') parenDepth++
          else if (ch === ')') parenDepth--
        }
        if (parenDepth > 0) {
          // Annotation spans multiple lines
          buffer = trimmed
          bufferStart = i
        } else {
          mergedLines.push({ text: trimmed, lineNumber: i + 1 })
        }
      } else {
        mergedLines.push({ text: trimmed, lineNumber: i + 1 })
      }
    }
  }
  // Flush remaining buffer
  if (buffer) {
    mergedLines.push({ text: buffer.trim(), lineNumber: bufferStart + 1 })
  }

  // Parse merged lines
  let currentAnnotation: {
    method: ParsedRoute['method']
    paths: string[]
    lineNumber: number
  } | null = null

  for (const { text: line, lineNumber } of mergedLines) {
    // Check for method-level mapping annotations
    for (const [annotation, httpMethod] of Object.entries(METHOD_ANNOTATIONS)) {
      const annotationRegex = new RegExp(`@${annotation}\\s*(?:\\(([^)]*)\\))?`)
      const match = line.match(annotationRegex)

      if (match) {
        const paths = extractPaths(match[1] || '', httpMethod)
        let resolvedMethod = httpMethod

        // For @RequestMapping, try to extract method attribute
        if (annotation === 'RequestMapping' && match[1]) {
          const methodMatch = match[1].match(
            /method\s*=\s*(?:RequestMethod\.)?(\w+)/
          )
          if (methodMatch) {
            resolvedMethod = methodMatch[1].toUpperCase() as ParsedRoute['method']
          }
        }

        currentAnnotation = {
          method: resolvedMethod,
          paths: paths.length > 0 ? paths : [''],
          lineNumber
        }
        break
      }
    }

    // If we have a pending annotation, look for the method declaration
    if (currentAnnotation && isMethodDeclaration(line)) {
      const methodNameMatch = line.match(/\w+\s+(\w+)\s*\(/)
      const methodName = methodNameMatch ? methodNameMatch[1] : 'unknown'

      for (const path of currentAnnotation.paths) {
        const fullPath = normalizePath(classPrefix + '/' + path)
        routes.push({
          method: currentAnnotation.method,
          path: fullPath,
          className,
          methodName,
          sourceFile: relative(projectPath, filePath),
          lineNumber: currentAnnotation.lineNumber
        })
      }
      currentAnnotation = null
    }
  }

  return routes
}

function extractClassLevelPath(content: string): string {
  // Match @RequestMapping on the class level (before class keyword)
  const classSection = content.split(/class\s+\w+/)[0] || ''
  // Collapse multi-line annotation: remove newlines between ( and )
  const collapsed = classSection.replace(/@RequestMapping\s*\([^)]*\)/s, (m) =>
    m.replace(/\s+/g, ' ')
  )
  const match = collapsed.match(/@RequestMapping\s*\(\s*([^)]*)\)/)
  if (!match) return ''
  return extractPaths(match[1], '*')[0] || ''
}

function extractPaths(annotationValue: string, _method: string): string[] {
  if (!annotationValue.trim()) return ['']

  const paths: string[] = []

  // Strip out non-path attributes to avoid extracting "application/json" from produces, etc.
  // Known non-path attributes in Spring mapping annotations:
  const nonPathAttrs = ['produces', 'consumes', 'headers', 'params', 'name', 'method']

  // First, try to extract explicit value= or path= attributes
  const valueMatch = annotationValue.match(/(?:value|path)\s*=\s*(\{[^}]*\}|"[^"]*")/)
  if (valueMatch) {
    // Extract all string literals from the value/path attribute
    const valueStr = valueMatch[1]
    const stringRegex = /"([^"]*)"/g
    let m: RegExpExecArray | null
    while ((m = stringRegex.exec(valueStr)) !== null) {
      paths.push(m[1])
    }
    return paths.length > 0 ? paths : ['']
  }

  // No explicit value= or path= attribute.
  // If the annotation has other named attributes (produces=, method=, etc.),
  // only extract the unnamed first argument as the path.
  const hasNamedAttr = nonPathAttrs.some(attr =>
    new RegExp(`\\b${attr}\\s*=`).test(annotationValue)
  )

  if (hasNamedAttr) {
    // There are named attributes but no value=. The path might be the first unnamed arg.
    // e.g. @RequestMapping("/path", method = GET) — the "/path" is before any named attr
    const beforeFirstAttr = annotationValue.split(/\b(?:produces|consumes|headers|params|name|method)\s*=/)[0]
    const stringRegex = /"([^"]*)"/g
    let m: RegExpExecArray | null
    while ((m = stringRegex.exec(beforeFirstAttr)) !== null) {
      // Skip obvious non-path values
      if (!m[1].includes('/') && m[1].includes('.')) continue
      paths.push(m[1])
    }
    return paths.length > 0 ? paths : ['']
  }

  // Simple case: @GetMapping("/path") or @GetMapping({"/p1", "/p2"})
  const stringRegex = /"([^"]*)"/g
  let stringMatch: RegExpExecArray | null
  while ((stringMatch = stringRegex.exec(annotationValue)) !== null) {
    // Skip obvious non-path values like "application/json"
    if (stringMatch[1].startsWith('application/') || stringMatch[1].startsWith('text/')) continue
    paths.push(stringMatch[1])
  }

  if (paths.length === 0) {
    const cleanValue = annotationValue
      .replace(/value\s*=\s*/, '')
      .replace(/path\s*=\s*/, '')
      .trim()
    if (cleanValue && !cleanValue.includes('=')) {
      paths.push(cleanValue)
    }
  }

  return paths.length > 0 ? paths : ['']
}

function isMethodDeclaration(line: string): boolean {
  // Simple heuristic: line contains a return type + method name + (
  // Exclude annotations, imports, class declarations
  if (line.startsWith('@') || line.startsWith('import') || line.startsWith('package')) {
    return false
  }
  if (line.includes('class ') || line.includes('interface ')) {
    return false
  }
  // Match: access_modifier? return_type method_name(
  return /(?:public|private|protected)?\s*(?:static\s+)?(?:[\w<>\[\],\s]+)\s+\w+\s*\(/.test(
    line
  )
}

function normalizePath(path: string): string {
  // Clean up the path
  return (
    '/' +
    path
      .split('/')
      .filter((segment) => segment.length > 0)
      .join('/')
  )
}

/**
 * Detect server.servlet.context-path from Spring Boot config files.
 * Checks (in order): application.yml, application.properties, ACM snapshot files.
 */
function detectContextPath(projectPath: string): string {
  // 1. Check application.yml / application.yaml in all submodules
  const ymlPatterns = [
    '**/src/main/resources/application.yml',
    '**/src/main/resources/application.yaml',
    '**/src/main/resources/application-*.yml',
    '**/src/main/resources/application-*.yaml'
  ]
  for (const pattern of ymlPatterns) {
    try {
      const files = require('glob').globSync(pattern, { cwd: projectPath, absolute: true })
      for (const f of files) {
        const content = readFileSync(f, 'utf-8')
        const match = content.match(/context-path\s*:\s*([^\s#]+)/)
        if (match) return match[1].trim()
      }
    } catch { /* ignore */ }
  }

  // 2. Check application.properties
  try {
    const propFiles = require('glob').globSync(
      '**/src/main/resources/application*.properties',
      { cwd: projectPath, absolute: true }
    )
    for (const f of propFiles) {
      const content = readFileSync(f, 'utf-8')
      const match = content.match(/server\.servlet\.context-path\s*=\s*(.+)/)
      if (match) return match[1].trim()
    }
  } catch { /* ignore */ }

  // 3. Check ACM / Nacos snapshot files (common in Chinese enterprise projects)
  try {
    const snapshotFiles = require('glob').globSync(
      'snapshot/**/*',
      { cwd: projectPath, absolute: true, nodir: true }
    )
    for (const f of snapshotFiles) {
      try {
        const content = readFileSync(f, 'utf-8')
        const match = content.match(/context-path\s*[:=]\s*([^\s#]+)/)
        if (match) return match[1].trim()
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  return ''
}
