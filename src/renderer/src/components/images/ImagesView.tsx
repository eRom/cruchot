import { useState, useEffect } from 'react'
import { ArrowLeft, ImageIcon } from 'lucide-react'
import { useUiStore } from '@/stores/ui.store'
import { ImageGrid, type ImageItem } from './ImageGrid'

export function ImagesView() {
  const setCurrentView = useUiStore((s) => s.setCurrentView)
  const [images, setImages] = useState<ImageItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadImages() {
      try {
        const list = await window.api.listImages()
        setImages(
          list.map((img) => ({
            id: img.id,
            path: img.path,
            prompt: img.prompt,
            createdAt: new Date(img.createdAt),
          }))
        )
      } catch (err) {
        console.error('Failed to load images:', err)
      } finally {
        setLoading(false)
      }
    }
    loadImages()
  }, [])

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/40 px-6 py-4">
        <button
          onClick={() => setCurrentView('chat')}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-lg font-semibold text-foreground">Galerie</h1>
        {images.length > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {images.length} image{images.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="text-sm text-muted-foreground">Chargement...</span>
          </div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
              <ImageIcon className="size-8 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Aucune image</p>
            <p className="text-xs text-muted-foreground">
              Les images generees apparaitront ici.
            </p>
          </div>
        ) : (
          <ImageGrid images={images} />
        )}
      </div>
    </div>
  )
}
