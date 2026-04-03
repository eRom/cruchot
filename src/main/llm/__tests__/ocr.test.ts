// src/main/llm/__tests__/ocr.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock getApiKeyForProvider BEFORE importing the service
const mockGetApiKey = vi.fn()
vi.mock('../../ipc/providers.ipc', () => ({
  getApiKeyForProvider: (...args: any[]) => mockGetApiKey(...args)
}))

// Mock fs for file size checks
const mockStatSync = vi.fn()
const mockReadFileSync = vi.fn()
vi.mock('node:fs', () => ({
  default: {
    statSync: (...args: any[]) => mockStatSync(...args),
    readFileSync: (...args: any[]) => mockReadFileSync(...args),
    existsSync: vi.fn(() => true)
  },
  statSync: (...args: any[]) => mockStatSync(...args),
  readFileSync: (...args: any[]) => mockReadFileSync(...args),
  existsSync: vi.fn(() => true)
}))

// Mock Mistral SDK (intercepted even for dynamic import)
const mockOcrProcess = vi.fn()
const mockFileUpload = vi.fn()
vi.mock('@mistralai/mistralai', () => ({
  Mistral: vi.fn().mockImplementation(() => ({
    ocr: { process: mockOcrProcess },
    files: { upload: mockFileUpload }
  }))
}))

import { ocrService, OcrError } from '../../services/ocr.service'

describe('OcrService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ocrService.invalidate() // Reset cached client
    mockStatSync.mockReturnValue({ size: 1000 })
    mockReadFileSync.mockReturnValue(Buffer.from('fake-pdf-content'))
  })

  describe('isAvailable', () => {
    it('returns true when Mistral API key is configured', () => {
      mockGetApiKey.mockReturnValue('sk-test-key')
      expect(ocrService.isAvailable()).toBe(true)
    })

    it('returns false when no API key', () => {
      mockGetApiKey.mockReturnValue(null)
      expect(ocrService.isAvailable()).toBe(false)
    })

    it('returns false when getApiKeyForProvider throws', () => {
      mockGetApiKey.mockImplementation(() => { throw new Error('DB error') })
      expect(ocrService.isAvailable()).toBe(false)
    })
  })

  describe('canProcess', () => {
    it('accepts application/pdf', () => {
      expect(ocrService.canProcess('application/pdf')).toBe(true)
    })

    it('accepts image/jpeg', () => {
      expect(ocrService.canProcess('image/jpeg')).toBe(true)
    })

    it('accepts image/png', () => {
      expect(ocrService.canProcess('image/png')).toBe(true)
    })

    it('accepts image/webp', () => {
      expect(ocrService.canProcess('image/webp')).toBe(true)
    })

    it('accepts image/tiff', () => {
      expect(ocrService.canProcess('image/tiff')).toBe(true)
    })

    it('accepts DOCX', () => {
      expect(ocrService.canProcess('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true)
    })

    it('rejects image/svg+xml', () => {
      expect(ocrService.canProcess('image/svg+xml')).toBe(false)
    })

    it('rejects text/plain', () => {
      expect(ocrService.canProcess('text/plain')).toBe(false)
    })

    it('rejects application/json', () => {
      expect(ocrService.canProcess('application/json')).toBe(false)
    })
  })

  describe('invalidate', () => {
    it('clears cached client without throwing', () => {
      ocrService.invalidate()
      // Next getClient() call should re-create
      expect(true).toBe(true)
    })
  })

  describe('processFile', () => {
    it('throws OcrError NO_API_KEY when key missing', async () => {
      mockGetApiKey.mockReturnValue(null)

      try {
        await ocrService.processFile('/test.pdf')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(OcrError)
        expect((err as OcrError).code).toBe('NO_API_KEY')
      }
    })

    it('throws OcrError FILE_TOO_LARGE for 60MB file', async () => {
      mockStatSync.mockReturnValue({ size: 60 * 1024 * 1024 })

      try {
        await ocrService.processFile('/huge.pdf')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(OcrError)
        expect((err as OcrError).code).toBe('FILE_TOO_LARGE')
        expect((err as OcrError).message).toContain('trop volumineux')
      }
    })

    it('sends base64 data URL and calls OCR on success', async () => {
      mockGetApiKey.mockReturnValue('sk-test')
      mockOcrProcess.mockResolvedValue({
        pages: [
          { index: 0, markdown: '# Page 1\n\nHello world', header: 'Header', footer: 'Page 1' }
        ],
        usageInfo: { pagesProcessed: 1, docSizeBytes: 1000 }
      })

      const result = await ocrService.processFile('/test.pdf')

      // Should send as base64 data URL, not file ID
      expect(mockOcrProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            type: 'document_url',
            documentUrl: expect.stringContaining('data:application/pdf;base64,')
          })
        })
      )
      expect(result.text).toContain('Hello world')
      expect(result.pagesProcessed).toBe(1)
      expect(result.pages).toHaveLength(1)
      expect(result.pages[0].header).toBe('Header')
    })

    it('passes tableFormat option to OCR', async () => {
      mockGetApiKey.mockReturnValue('sk-test')
      mockOcrProcess.mockResolvedValue({ pages: [], usageInfo: { pagesProcessed: 0 } })

      await ocrService.processFile('/test.pdf', { tableFormat: 'html' })

      expect(mockOcrProcess).toHaveBeenCalledWith(
        expect.objectContaining({ tableFormat: 'html' })
      )
    })
  })

  describe('processImage', () => {
    it('throws OcrError UNSUPPORTED_FORMAT for SVG', async () => {
      try {
        await ocrService.processImage(Buffer.from('svg'), 'image/svg+xml')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(OcrError)
        expect((err as OcrError).code).toBe('UNSUPPORTED_FORMAT')
      }
    })

    it('sends base64 data URL for JPEG image', async () => {
      mockGetApiKey.mockReturnValue('sk-test')
      mockOcrProcess.mockResolvedValue({
        pages: [{ index: 0, markdown: 'Text from image' }],
        usageInfo: { pagesProcessed: 1, docSizeBytes: 500 }
      })

      const buf = Buffer.from('fake-jpeg')
      const result = await ocrService.processImage(buf, 'image/jpeg')

      expect(mockOcrProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          document: {
            type: 'image_url',
            imageUrl: `data:image/jpeg;base64,${buf.toString('base64')}`
          }
        })
      )
      expect(result.text).toBe('Text from image')
    })
  })

  describe('error handling', () => {
    it('wraps rate limit errors as RATE_LIMIT', async () => {
      mockGetApiKey.mockReturnValue('sk-test')
      mockOcrProcess.mockRejectedValue(new Error('429 rate limit exceeded'))

      try {
        await ocrService.processFile('/test.pdf')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(OcrError)
        expect((err as OcrError).code).toBe('RATE_LIMIT')
      }
    })

    it('wraps generic errors as API_ERROR', async () => {
      mockGetApiKey.mockReturnValue('sk-test')
      mockOcrProcess.mockRejectedValue(new Error('Internal server error'))

      try {
        await ocrService.processFile('/test.pdf')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(OcrError)
        expect((err as OcrError).code).toBe('API_ERROR')
      }
    })
  })
})
