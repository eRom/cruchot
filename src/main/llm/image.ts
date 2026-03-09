import { experimental_generateImage } from 'ai'
import { getGoogleProvider } from './providers'

export type ImageModel = 'gemini-3.1-flash-image-preview' | 'gemini-3-pro-image-preview'
export type ImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4'

export interface GenerateImageOptions {
  model?: ImageModel
  aspectRatio?: ImageAspectRatio
}

export interface GenerateImageResult {
  base64: string
  mimeType: string
}

/**
 * Generates an image using Google Gemini via the Vercel AI SDK.
 * Retrieves the API key from safeStorage internally.
 */
export async function generateImage(
  prompt: string,
  options?: GenerateImageOptions
): Promise<GenerateImageResult> {
  if (!prompt || prompt.trim().length === 0) {
    throw new Error('Image prompt cannot be empty')
  }

  const google = getGoogleProvider()
  const modelId = options?.model ?? 'gemini-3.1-flash-image-preview'
  const aspectRatio = options?.aspectRatio ?? '1:1'

  try {
    const result = await experimental_generateImage({
      model: google.image(modelId),
      prompt,
      providerOptions: {
        google: { aspectRatio }
      }
    })

    const image = result.image

    return {
      base64: image.base64,
      mimeType: image.mimeType ?? 'image/png'
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('API key')) {
      throw new Error('Google API key not configured or invalid')
    }
    throw error
  }
}
