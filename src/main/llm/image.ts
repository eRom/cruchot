import { experimental_generateImage } from 'ai'
import { getGoogleProvider, getOpenAIProvider } from './providers'

export type ImageModel = 'gemini-3.1-flash-image-preview' | 'gemini-3-pro-image-preview' | 'gpt-image-1.5'
export type ImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4'

export interface GenerateImageOptions {
  model?: ImageModel
  aspectRatio?: ImageAspectRatio
}

export interface GenerateImageResult {
  base64: string
  mimeType: string
}

/** Convert aspect ratio to OpenAI size string */
function aspectRatioToSize(ratio: ImageAspectRatio): string {
  switch (ratio) {
    case '1:1': return '1024x1024'
    case '16:9': return '1536x1024'
    case '9:16': return '1024x1536'
    case '4:3': return '1536x1024'
    case '3:4': return '1024x1536'
    default: return '1024x1024'
  }
}

/**
 * Generates an image using Google Gemini or OpenAI via the Vercel AI SDK.
 * Retrieves the API key from safeStorage internally.
 */
export async function generateImage(
  prompt: string,
  options?: GenerateImageOptions
): Promise<GenerateImageResult> {
  if (!prompt || prompt.trim().length === 0) {
    throw new Error('Image prompt cannot be empty')
  }

  const modelId = options?.model ?? 'gemini-3.1-flash-image-preview'
  const aspectRatio = options?.aspectRatio ?? '1:1'

  try {
    if (modelId.startsWith('gpt-image')) {
      // OpenAI image generation
      const openai = getOpenAIProvider()
      const result = await experimental_generateImage({
        model: openai.image(modelId),
        prompt,
        size: aspectRatioToSize(aspectRatio)
      })

      return {
        base64: result.image.base64,
        mimeType: result.image.mimeType ?? 'image/png'
      }
    } else {
      // Google Gemini image generation
      const google = getGoogleProvider()
      const result = await experimental_generateImage({
        model: google.image(modelId),
        prompt,
        providerOptions: {
          google: { aspectRatio }
        }
      })

      return {
        base64: result.image.base64,
        mimeType: result.image.mimeType ?? 'image/png'
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('API key')) {
      const provider = modelId.startsWith('gpt-image') ? 'OpenAI' : 'Google'
      throw new Error(`${provider} API key not configured or invalid`)
    }
    throw error
  }
}
