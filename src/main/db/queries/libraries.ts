import { eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDatabase } from '../index'
import { libraries, librarySources, libraryChunks, conversations } from '../schema'

// ── Libraries CRUD ─────────────────────────────────────

export function getAllLibraries() {
  const db = getDatabase()
  return db.select().from(libraries).orderBy(libraries.createdAt).all()
}

export function getLibrary(id: string) {
  const db = getDatabase()
  return db.select().from(libraries).where(eq(libraries.id, id)).get() ?? null
}

export function createLibrary(data: {
  name: string
  description?: string
  color?: string
  icon?: string
  projectId?: string
  embeddingModel?: 'local' | 'google'
}) {
  const db = getDatabase()
  const id = nanoid()
  const now = new Date()
  const dimensions = data.embeddingModel === 'google' ? 768 : 384

  db.insert(libraries).values({
    id,
    name: data.name,
    description: data.description ?? null,
    color: data.color ?? null,
    icon: data.icon ?? null,
    projectId: data.projectId ?? null,
    embeddingModel: data.embeddingModel ?? 'local',
    embeddingDimensions: dimensions,
    status: 'empty',
    createdAt: now,
    updatedAt: now
  }).run()

  return getLibrary(id)!
}

export function updateLibrary(id: string, data: {
  name?: string
  description?: string
  color?: string
  icon?: string
}) {
  const db = getDatabase()
  db.update(libraries)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.color !== undefined ? { color: data.color } : {}),
      ...(data.icon !== undefined ? { icon: data.icon } : {}),
      updatedAt: new Date()
    })
    .where(eq(libraries.id, id))
    .run()
  return getLibrary(id)
}

export function deleteLibrary(id: string) {
  const db = getDatabase()
  // FK cascade handles library_sources and library_chunks
  db.delete(libraries).where(eq(libraries.id, id)).run()
  // Clear activeLibraryId on any conversation using this library
  db.update(conversations)
    .set({ activeLibraryId: null })
    .where(eq(conversations.activeLibraryId, id))
    .run()
}

export function updateLibraryStatus(id: string, status: 'empty' | 'indexing' | 'ready' | 'error') {
  const db = getDatabase()
  db.update(libraries)
    .set({
      status,
      updatedAt: new Date(),
      ...(status === 'ready' ? { lastIndexedAt: new Date() } : {})
    })
    .where(eq(libraries.id, id))
    .run()
}

export function updateLibraryStats(id: string) {
  const db = getDatabase()
  const sourcesResult = db.select({ count: sql<number>`count(*)` })
    .from(librarySources)
    .where(eq(librarySources.libraryId, id))
    .get()
  const chunksResult = db.select({ count: sql<number>`count(*)` })
    .from(libraryChunks)
    .where(eq(libraryChunks.libraryId, id))
    .get()
  const sizeResult = db.select({ total: sql<number>`coalesce(sum(size_bytes), 0)` })
    .from(librarySources)
    .where(eq(librarySources.libraryId, id))
    .get()

  db.update(libraries)
    .set({
      sourcesCount: sourcesResult?.count ?? 0,
      chunksCount: chunksResult?.count ?? 0,
      totalSizeBytes: sizeResult?.total ?? 0,
      updatedAt: new Date()
    })
    .where(eq(libraries.id, id))
    .run()
}

// ── Library Sources CRUD ─────────────────────────────────

export function getLibrarySources(libraryId: string) {
  const db = getDatabase()
  return db.select().from(librarySources)
    .where(eq(librarySources.libraryId, libraryId))
    .orderBy(librarySources.createdAt)
    .all()
}

export function getLibrarySource(id: string) {
  const db = getDatabase()
  return db.select().from(librarySources).where(eq(librarySources.id, id)).get() ?? null
}

export function createLibrarySource(data: {
  libraryId: string
  filename: string
  originalPath: string
  storedPath: string
  mimeType: string
  sizeBytes: number
  contentHash?: string
}) {
  const db = getDatabase()
  const id = nanoid()
  const now = new Date()

  db.insert(librarySources).values({
    id,
    libraryId: data.libraryId,
    filename: data.filename,
    originalPath: data.originalPath,
    storedPath: data.storedPath,
    mimeType: data.mimeType,
    sizeBytes: data.sizeBytes,
    contentHash: data.contentHash ?? null,
    status: 'pending',
    createdAt: now,
    updatedAt: now
  }).run()

  return getLibrarySource(id)!
}

export function updateSourceStatus(
  id: string,
  status: 'pending' | 'extracting' | 'chunking' | 'indexing' | 'ready' | 'error',
  extra?: { errorMessage?: string; extractedText?: string; extractedLength?: number; chunksCount?: number }
) {
  const db = getDatabase()
  db.update(librarySources)
    .set({
      status,
      updatedAt: new Date(),
      ...(extra?.errorMessage !== undefined ? { errorMessage: extra.errorMessage } : {}),
      ...(extra?.extractedText !== undefined ? { extractedText: extra.extractedText } : {}),
      ...(extra?.extractedLength !== undefined ? { extractedLength: extra.extractedLength } : {}),
      ...(extra?.chunksCount !== undefined ? { chunksCount: extra.chunksCount } : {})
    })
    .where(eq(librarySources.id, id))
    .run()
}

export function deleteLibrarySource(id: string) {
  const db = getDatabase()
  // FK cascade handles library_chunks
  db.delete(librarySources).where(eq(librarySources.id, id)).run()
}

// ── Library Chunks ─────────────────────────────────────

export function createLibraryChunks(chunks: Array<{
  libraryId: string
  sourceId: string
  pointId: string
  chunkIndex: number
  startChar: number
  endChar: number
  heading?: string
  lineStart?: number
  lineEnd?: number
}>) {
  const db = getDatabase()
  const now = new Date()

  for (const chunk of chunks) {
    db.insert(libraryChunks).values({
      id: nanoid(),
      libraryId: chunk.libraryId,
      sourceId: chunk.sourceId,
      pointId: chunk.pointId,
      chunkIndex: chunk.chunkIndex,
      startChar: chunk.startChar,
      endChar: chunk.endChar,
      heading: chunk.heading ?? null,
      lineStart: chunk.lineStart ?? null,
      lineEnd: chunk.lineEnd ?? null,
      createdAt: now
    }).run()
  }
}

export function deleteChunksBySource(sourceId: string) {
  const db = getDatabase()
  db.delete(libraryChunks).where(eq(libraryChunks.sourceId, sourceId)).run()
}

export function deleteChunksByLibrary(libraryId: string) {
  const db = getDatabase()
  db.delete(libraryChunks).where(eq(libraryChunks.libraryId, libraryId)).run()
}

export function getChunksBySource(sourceId: string) {
  const db = getDatabase()
  return db.select().from(libraryChunks)
    .where(eq(libraryChunks.sourceId, sourceId))
    .orderBy(libraryChunks.chunkIndex)
    .all()
}

// ── Conversation ↔ Library (sticky) ────────────────────

export function getConversationLibraryId(conversationId: string): string | null {
  const db = getDatabase()
  const row = db.select({ activeLibraryId: conversations.activeLibraryId })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .get()
  return row?.activeLibraryId ?? null
}

export function setConversationLibraryId(conversationId: string, libraryId: string | null) {
  const db = getDatabase()
  db.update(conversations)
    .set({ activeLibraryId: libraryId, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId))
    .run()
}

// ── Bulk delete (for cleanup) ─────────────────────────

export function deleteAllLibraryData() {
  const db = getDatabase()
  db.delete(libraryChunks).run()
  db.delete(librarySources).run()
  db.delete(libraries).run()
}
