import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { DEFAULT_VCR_HTML_TEMPLATE } from './vcr-html-template'

const TEMPLATE_FILENAME = 'template-vcr-share.html'
const DATA_START_MARKER = '<!-- VCR_DATA_START -->'
const DATA_END_MARKER = '<!-- VCR_DATA_END -->'

class VcrHtmlExporterService {
  /**
   * Ensure the template file exists in userData.
   * Called on first export or at app startup.
   */
  ensureTemplate(): void {
    const templatePath = this.getTemplatePath()
    if (!existsSync(templatePath)) {
      writeFileSync(templatePath, DEFAULT_VCR_HTML_TEMPLATE, 'utf-8')
      console.log(`[VCR] Template written to ${templatePath}`)
    }
  }

  /**
   * Generate an HTML file from recording data using the user's template.
   */
  generateHtml(recordingData: { header: Record<string, unknown>; events: unknown[] }): string {
    this.ensureTemplate()

    const templatePath = this.getTemplatePath()
    const template = readFileSync(templatePath, 'utf-8')

    const startIdx = template.indexOf(DATA_START_MARKER)
    const endIdx = template.indexOf(DATA_END_MARKER)

    if (startIdx === -1 || endIdx === -1) {
      throw new Error(
        `Template is missing VCR_DATA markers. Expected ${DATA_START_MARKER} and ${DATA_END_MARKER} in ${templatePath}`
      )
    }

    const jsonData = JSON.stringify(recordingData)
    const dataSection = `${DATA_START_MARKER}\n<script type="application/json" id="vcr-data">${jsonData}</script>\n${DATA_END_MARKER}`

    const before = template.substring(0, startIdx)
    const after = template.substring(endIdx + DATA_END_MARKER.length)

    return before + dataSection + after
  }

  /**
   * Write HTML to a file.
   */
  writeHtml(html: string, destPath: string): void {
    writeFileSync(destPath, html, 'utf-8')
    console.log(`[VCR] HTML exported to ${destPath}`)
  }

  private getTemplatePath(): string {
    return join(app.getPath('userData'), TEMPLATE_FILENAME)
  }
}

export const vcrHtmlExporterService = new VcrHtmlExporterService()
