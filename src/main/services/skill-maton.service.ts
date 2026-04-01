/**
 * MatonService — Wrapper Python subprocess pour le scanner de securite Maton.
 * Maton est installe dans ~/.cruchot/skills/maton/scripts/scanner/
 * Invoque via : python3 -m scanner <dir> --format json (CWD = scripts/)
 * Exit codes : 0 (OK), 1 (WARNING), 2 (CRITICAL) — stdout contient JSON dans tous les cas.
 */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import { skillService } from './skill.service'

// ── Types ────────────────────────────────────────────────

export interface MatonFinding {
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  category: string
  rule_id: string
  file: string
  line: number
  match: string
  description: string
}

export interface MatonReport {
  source: string
  scan_date: string
  verdict: 'OK' | 'WARNING' | 'CRITICAL'
  summary: { critical: number; warning: number; info: number }
  findings: MatonFinding[]
}

export type MatonScanResult =
  | { success: true; report: MatonReport }
  | { success: false; error: string; pythonMissing?: boolean }

// ── Service ──────────────────────────────────────────────

class MatonService {
  /** Chemin cache vers le dossier scripts/scanner/ (ou null si introuvable). */
  private cachedScannerPath: string | null | undefined = undefined

  /**
   * Cherche le scanner Maton dans le dossier skills de Maton.
   * Retourne le chemin absolu vers scripts/scanner/ ou null.
   */
  private findMaton(): string | null {
    if (this.cachedScannerPath !== undefined) {
      return this.cachedScannerPath
    }

    const skillsDir = join(os.homedir(), '.cruchot', 'skills')
    const scannerPath = join(skillsDir, 'maton', 'scripts', 'scanner')
    const mainPy = join(scannerPath, '__main__.py')

    if (existsSync(mainPy)) {
      this.cachedScannerPath = scannerPath
    } else {
      this.cachedScannerPath = null
    }

    return this.cachedScannerPath
  }

  /**
   * Scanne un dossier avec Maton.
   * @param targetDir Chemin absolu du dossier a scanner.
   */
  async scan(targetDir: string): Promise<MatonScanResult> {
    // 1. Verifier Python disponible
    const pythonAvailable = await skillService.checkPythonAvailable()
    if (!pythonAvailable) {
      return {
        success: false,
        error: 'Python 3 introuvable. Installez Python 3.8+ pour utiliser Maton.',
        pythonMissing: true
      }
    }

    // 2. Localiser Maton
    const scannerDir = this.findMaton()
    if (!scannerDir) {
      return {
        success: false,
        error: 'Maton introuvable. Installez le skill maton dans ~/.cruchot/skills/maton/'
      }
    }

    // 3. CWD = scripts/ (parent de scanner/)
    const cwd = join(scannerDir, '..')

    // 4. Executer le scan
    let stdout: string

    try {
      const result = execSync(
        `python3 -m scanner "${targetDir}" --format json`,
        {
          cwd,
          env: {
            ...process.env,
            PYTHONDONTWRITEBYTECODE: '1',
            PYTHONPATH: cwd
          },
          timeout: 120_000,
          encoding: 'utf-8'
        }
      )
      stdout = result
    } catch (err: unknown) {
      // execSync throws on exit code != 0, mais stdout contient quand meme le JSON
      const execError = err as { stdout?: Buffer | string; message?: string }
      if (execError.stdout) {
        stdout = Buffer.isBuffer(execError.stdout)
          ? execError.stdout.toString('utf-8')
          : execError.stdout
      } else {
        return {
          success: false,
          error: `Erreur Maton : ${execError.message ?? String(err)}`
        }
      }
    }

    // 5. Parser le JSON
    try {
      const report = JSON.parse(stdout.trim()) as MatonReport
      return { success: true, report }
    } catch {
      return {
        success: false,
        error: `Sortie Maton invalide (JSON attendu) : ${stdout.slice(0, 200)}`
      }
    }
  }

  /** Invalide le cache du chemin du scanner (utile apres installation de Maton). */
  resetCache(): void {
    this.cachedScannerPath = undefined
  }
}

export const matonService = new MatonService()
