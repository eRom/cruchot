import { useState } from 'react'
import { ImageLightbox } from './ImageLightbox'

export interface ImageItem {
  id: string
  path: string
  prompt: string
  createdAt: Date
}

interface ImageGridProps {
  images: ImageItem[]
}

export function ImageGrid({ images }: ImageGridProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {images.map((img) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setLightboxSrc(img.path)}
            className="group relative aspect-square overflow-hidden rounded-xl border border-border/40 bg-muted transition-shadow hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <img
              src={img.path}
              alt={img.prompt}
              className="size-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />

            {/* Overlay with prompt + date */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 opacity-0 transition-opacity group-hover:opacity-100">
              <p className="line-clamp-2 text-left text-xs text-white">
                {img.prompt}
              </p>
              <p className="mt-1 text-left text-[10px] text-white/60">
                {img.createdAt.toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
                })}
              </p>
            </div>
          </button>
        ))}
      </div>

      <ImageLightbox
        src={lightboxSrc ?? ''}
        isOpen={lightboxSrc !== null}
        onClose={() => setLightboxSrc(null)}
      />
    </>
  )
}
