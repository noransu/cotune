/**
 * electron-builder afterPack hook
 *
 * Ensures node-pty's native binaries (pty.node + spawn-helper) match the
 * target architecture inside the packed app.  electron-builder's built-in
 * npmRebuild does NOT properly cross-compile node-pty (it only downloads
 * prebuilt binaries for packages like better-sqlite3 that support it, but
 * silently skips source-compiled packages like node-pty).  This hook
 * unconditionally rebuilds node-pty for the target arch and copies the
 * correct binaries into the packed app.
 */

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

/** electron-builder Arch enum → string */
const ARCH_MAP = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' }

/** expected `file` output substring per arch */
const FILE_ARCH = { x64: 'x86_64', arm64: 'arm64' }

exports.default = async function afterPack(context) {
  const { electronPlatformName, arch, appOutDir, packager } = context

  // Only relevant on macOS where node-pty uses posix_spawn + spawn-helper
  if (electronPlatformName !== 'darwin') return

  const archStr = typeof arch === 'number' ? ARCH_MAP[arch] : String(arch)
  const expectedFileArch = FILE_ARCH[archStr]
  if (!expectedFileArch) {
    console.log(`[afterPack] Unsupported arch "${archStr}", skipping node-pty fix`)
    return
  }

  // Locate node-pty inside the packed (asar-unpacked) app
  const appName = packager.appInfo.productFilename
  const unpackedNodePty = path.join(
    appOutDir,
    `${appName}.app`,
    'Contents',
    'Resources',
    'app.asar.unpacked',
    'node_modules',
    'node-pty'
  )

  const destBuild = path.join(unpackedNodePty, 'build', 'Release')
  const ptyNode = path.join(destBuild, 'pty.node')

  if (!fs.existsSync(ptyNode)) {
    console.log(`[afterPack] node-pty build/Release/pty.node not found at ${ptyNode}, skipping`)
    return
  }

  // Log current state
  const beforeInfo = execSync(`file "${ptyNode}"`).toString().trim()
  console.log(`[afterPack] Before fix (target=${archStr}): ${beforeInfo}`)

  // Always rebuild node-pty for the target architecture.
  // This is necessary because electron-builder's npmRebuild does not properly
  // compile node-pty from source for cross-arch builds (and sometimes even for
  // native-arch builds after a prior cross-arch rebuild in the same session).
  const projectRoot = path.resolve(__dirname, '..')
  console.log(`[afterPack] Rebuilding node-pty for ${archStr}...`)

  execSync(`npx @electron/rebuild -f -o node-pty --arch ${archStr}`, {
    stdio: 'inherit',
    cwd: projectRoot
  })

  // Copy rebuilt binaries into the packed app
  const srcBuild = path.join(projectRoot, 'node_modules', 'node-pty', 'build', 'Release')

  for (const file of ['pty.node', 'spawn-helper']) {
    const src = path.join(srcBuild, file)
    const dest = path.join(destBuild, file)
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest)
      // Ensure spawn-helper is executable
      if (file === 'spawn-helper') {
        fs.chmodSync(dest, 0o755)
      }
      console.log(`[afterPack]   Copied ${file} → packed app`)
    } else {
      console.warn(`[afterPack]   WARNING: rebuilt ${file} not found at ${src}`)
    }
  }

  // Verify the fix
  const afterInfo = execSync(`file "${ptyNode}"`).toString().trim()
  if (afterInfo.includes(expectedFileArch)) {
    console.log(`[afterPack] Verified OK: ${afterInfo}`)
  } else {
    console.error(`[afterPack] VERIFICATION FAILED: ${afterInfo}`)
    console.error(`[afterPack] Expected arch substring: ${expectedFileArch}`)
    throw new Error(`node-pty architecture mismatch: expected ${archStr} but got: ${afterInfo}`)
  }
}
