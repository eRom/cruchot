/**
 * electron-builder afterPack hook — flip @electron/fuses on the packaged binary.
 *
 * Why this matters:
 * Cruchot ships with `forceCodeSigning: false` + `notarize: false` + `hardenedRuntime: false`
 * (hobbyist distribution, no Apple Developer cert). Without code signing, the only line of
 * defense against asar tampering and runtime abuse is @electron/fuses. This hook flips:
 *
 *   - RunAsNode: false                          → blocks ELECTRON_RUN_AS_NODE=1
 *   - EnableNodeOptionsEnvironmentVariable: f   → blocks NODE_OPTIONS=--inspect-brk
 *   - EnableNodeCliInspectArguments: false      → blocks --inspect / --inspect-brk
 *   - EnableEmbeddedAsarIntegrityValidation: t  → refuses to load a tampered asar (CRITICAL)
 *   - OnlyLoadAppFromAsar: true                 → refuses to load app code outside the asar
 *   - EnableCookieEncryption: true              → encrypts cookies stored on disk
 *   - LoadBrowserProcessSpecificV8Snapshot: f   → standard V8 snapshot
 *   - GrantFileProtocolExtraPrivileges: false   → reduces file:// privileges (we use local-image://)
 *
 * Apple Silicon note: when forceCodeSigning is false, we MUST pass
 * `resetAdHocDarwinSignature: true` for arm64 macOS builds, otherwise the app will refuse
 * to launch with a code signature validation error.
 *
 * Verify after a build: `npx @electron/fuses read --app dist/mac-arm64/Cruchot.app`
 *
 * Related: audit S65/S66 — see audit/security/security-audit-s66.md
 */

const path = require('path')
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')
const { Arch } = require('electron-builder')

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName, arch, packager } = context
  const productName = packager.appInfo.productFilename

  let electronBinaryPath
  switch (electronPlatformName) {
    case 'darwin':
    case 'mas':
      electronBinaryPath = path.join(
        appOutDir,
        `${productName}.app`,
        'Contents',
        'MacOS',
        productName
      )
      break
    case 'win32':
      electronBinaryPath = path.join(appOutDir, `${productName}.exe`)
      break
    case 'linux':
      electronBinaryPath = path.join(appOutDir, productName.toLowerCase())
      break
    default:
      throw new Error(`[afterPack] Unsupported platform: ${electronPlatformName}`)
  }

  const isDarwinArm64 = electronPlatformName === 'darwin' && arch === Arch.arm64

  console.log(`[afterPack] Flipping fuses on ${electronBinaryPath}`)
  console.log(`[afterPack] platform=${electronPlatformName} arch=${Arch[arch]} resetAdHocSig=${isDarwinArm64}`)

  await flipFuses(electronBinaryPath, {
    version: FuseVersion.V1,
    // REQUIRED on Apple Silicon when not code-signing immediately after flipping fuses.
    // Without this, macOS Gatekeeper rejects the modified binary as "damaged".
    resetAdHocDarwinSignature: isDarwinArm64,

    // Block ELECTRON_RUN_AS_NODE — prevents using the binary as a Node interpreter
    [FuseV1Options.RunAsNode]: false,

    // Encrypt cookies stored on disk (defense if attacker gains filesystem access)
    [FuseV1Options.EnableCookieEncryption]: true,

    // Block NODE_OPTIONS env var (--inspect-brk attaches via this — remote debugger)
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,

    // Block --inspect and --inspect-brk CLI args
    [FuseV1Options.EnableNodeCliInspectArguments]: false,

    // Validate the asar archive at load time (defense against tampering).
    // CRITICAL given forceCodeSigning: false — this is the only thing preventing
    // an attacker who replaces app.asar from getting RCE in the main process.
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,

    // Refuse to load app code from anywhere other than app.asar
    [FuseV1Options.OnlyLoadAppFromAsar]: true,

    // Use the standard V8 snapshot for the browser process
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,

    // Reduce file:// protocol privileges (we use local-image:// for local resources)
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  })

  console.log(`[afterPack] Fuses flipped successfully on ${electronPlatformName}-${Arch[arch]}`)
}
