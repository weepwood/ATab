import { db } from './db'
import type {
  CloudBookmarkImportCandidate,
  CloudBookmarkRecord,
} from './domain'
import {
  createCloudBookmarkRecord,
  toCloudBookmarkPayload,
  updateCloudBookmarkRecord,
  type CloudBookmarkInput,
} from './cloudBookmarks'
import { queueSyncDelete, queueSyncUpsert } from './sync/outbox'

export async function createCloudBookmark(
  input: CloudBookmarkInput,
): Promise<CloudBookmarkRecord> {
  const record = createCloudBookmarkRecord(input)
  await saveCloudBookmarkRecord(record)
  return record
}

export async function updateCloudBookmark(
  current: CloudBookmarkRecord,
  input: CloudBookmarkInput,
): Promise<CloudBookmarkRecord> {
  const record = updateCloudBookmarkRecord(current, input)
  await saveCloudBookmarkRecord(record)
  return record
}

export async function deleteCloudBookmark(record: CloudBookmarkRecord): Promise<void> {
  await db.transaction(
    'rw',
    db.cloudBookmarks,
    db.syncOutbox,
    db.syncVersions,
    async () => {
      await db.cloudBookmarks.delete(record.id)
      await queueSyncDelete('cloud-bookmark', record.id)
    },
  )
}

export async function importBrowserBookmarks(
  candidates: CloudBookmarkImportCandidate[],
): Promise<{ created: number; skipped: number }> {
  const selected = candidates.filter((candidate) => !candidate.duplicate)
  if (selected.length === 0) return { created: 0, skipped: candidates.length }

  const existing = new Set(
    (await db.cloudBookmarks.toArray()).map((record) => record.canonicalUrl),
  )
  let created = 0
  let skipped = candidates.length - selected.length

  await db.transaction(
    'rw',
    db.cloudBookmarks,
    db.syncOutbox,
    db.syncVersions,
    async () => {
      for (const candidate of selected) {
        if (existing.has(candidate.canonicalUrl)) {
          skipped += 1
          continue
        }
        const record = createCloudBookmarkRecord({
          title: candidate.title,
          url: candidate.url,
          folder: candidate.folder,
          source: 'browser-bookmark',
          sourceBookmarkId: candidate.sourceBookmarkId,
        })
        await db.cloudBookmarks.put(record)
        await queueSyncUpsert('cloud-bookmark', record.id, toCloudBookmarkPayload(record))
        existing.add(record.canonicalUrl)
        created += 1
      }
    },
  )

  return { created, skipped }
}

async function saveCloudBookmarkRecord(record: CloudBookmarkRecord): Promise<void> {
  await db.transaction(
    'rw',
    db.cloudBookmarks,
    db.syncOutbox,
    db.syncVersions,
    async () => {
      await db.cloudBookmarks.put(record)
      await queueSyncUpsert('cloud-bookmark', record.id, toCloudBookmarkPayload(record))
    },
  )
}
