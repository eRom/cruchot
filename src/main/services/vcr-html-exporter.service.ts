class VcrHtmlExporterService {
  async exportHtml(
    _recordingId: string,
    _destPath: string,
    _options?: { anonymize?: boolean }
  ): Promise<void> {
    throw new Error('VCR HTML export not yet implemented')
  }
}

export const vcrHtmlExporterService = new VcrHtmlExporterService()
