import { writeFileSync } from 'fs'
import { vcrRecorderService } from './vcr-recorder.service'
import { vcrAnonymizerService } from './vcr-anonymizer.service'
import { generateVcrHtml } from './vcr-html-template'

class VcrHtmlExporterService {
  async exportHtml(
    recordingId: string,
    destPath: string,
    options?: { anonymize?: boolean }
  ): Promise<void> {
    const recording = vcrRecorderService.getRecording(recordingId)

    if (options?.anonymize) {
      recording.events = vcrAnonymizerService.anonymizeEvents(recording.events)
      // Anonymize header paths too
      const username =
        process.env.HOME?.split('/').pop() ?? process.env.USERPROFILE?.split('\\').pop()
      if (username && recording.header.workspacePath) {
        recording.header.workspacePath = recording.header.workspacePath.replace(
          new RegExp(`/Users/${username}/`, 'g'),
          '/Users/user1/'
        )
      }
    }

    const html = generateVcrHtml(recording)
    writeFileSync(destPath, html, 'utf-8')
    console.log(`[VCR] HTML exported to ${destPath}`)
  }
}

export const vcrHtmlExporterService = new VcrHtmlExporterService()
