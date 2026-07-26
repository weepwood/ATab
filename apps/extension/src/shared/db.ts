import Dexie, { type EntityTable } from 'dexie'
import type {
  SyncEntitySnapshot,
  SyncEntityType,
  SyncOperation,
} from '@atab/contracts/sync'
import type {
  AiActionPlan,
  CloudBookmarkRecord,
  ResourceContentRecord,
  ResourceEmbeddingRecord,
  ResourceRecord,
  ResourceSummaryRecord,
  SessionRecord,
} from './domain'

export interface SettingRecord {
  key: string
  value: unknown
  updatedAt: string
}

export interface SyncOutboxRecord {
  id: string
  changeId: string
  entityKey: string
  entityType: SyncEntityType
  entityId: string
  baseVersion: number
  operation: SyncOperation
  payload: Record<string, unknown> | null
  clientUpdatedAt: string
  status: 'pending' | 'conflict'
  attempts: number
  lastError?: string
  serverEntity?: SyncEntitySnapshot | null
  createdAt: string
  updatedAt: string
}

export interface SyncVersionRecord {
  key: string
  entityType: SyncEntityType
  entityId: string
  version: number
  updatedAt: string
}

export interface SyncMetadataRecord {
  key: string
  value: unknown
  updatedAt: string
}

class ATabDatabase extends Dexie {
  resources!: EntityTable<ResourceRecord, 'id'>
  resourceContents!: EntityTable<ResourceContentRecord, 'resourceId'>
  resourceSummaries!: EntityTable<ResourceSummaryRecord, 'resourceId'>
  resourceEmbeddings!: EntityTable<ResourceEmbeddingRecord, 'resourceId'>
  sessions!: EntityTable<SessionRecord, 'id'>
  cloudBookmarks!: EntityTable<CloudBookmarkRecord, 'id'>
  settings!: EntityTable<SettingRecord, 'key'>
  actionPlans!: EntityTable<AiActionPlan, 'id'>
  syncOutbox!: EntityTable<SyncOutboxRecord, 'id'>
  syncVersions!: EntityTable<SyncVersionRecord, 'key'>
  syncMetadata!: EntityTable<SyncMetadataRecord, 'key'>

  constructor() {
    super('atab')
    this.version(1).stores({
      resources: 'id, canonicalUrl, domain, lastSeenAt',
      sessions: 'id, updatedAt',
      settings: 'key, updatedAt',
      actionPlans: 'id, createdAt, risk',
    })
    this.version(2).stores({
      resources: 'id, canonicalUrl, domain, lastSeenAt',
      sessions: 'id, kind, updatedAt',
      settings: 'key, updatedAt',
      actionPlans: 'id, createdAt, risk',
    })
    this.version(3).stores({
      resources: 'id, canonicalUrl, domain, lastSeenAt',
      sessions: 'id, kind, updatedAt',
      settings: 'key, updatedAt',
      actionPlans: 'id, createdAt, risk',
      syncOutbox: 'id, entityKey, entityType, status, updatedAt',
      syncVersions: 'key, entityType, entityId',
      syncMetadata: 'key, updatedAt',
    })
    this.version(4).stores({
      resources: 'id, canonicalUrl, domain, lastSeenAt',
      sessions: 'id, kind, updatedAt',
      cloudBookmarks: 'id, canonicalUrl, folder, archived, updatedAt',
      settings: 'key, updatedAt',
      actionPlans: 'id, createdAt, risk',
      syncOutbox: 'id, entityKey, entityType, status, updatedAt',
      syncVersions: 'key, entityType, entityId',
      syncMetadata: 'key, updatedAt',
    })
    this.version(5).stores({
      resources: 'id, canonicalUrl, domain, capturedAt, lastSeenAt',
      resourceContents: 'resourceId, capturedAt, contentHash',
      sessions: 'id, kind, updatedAt',
      cloudBookmarks: 'id, canonicalUrl, folder, archived, updatedAt',
      settings: 'key, updatedAt',
      actionPlans: 'id, createdAt, risk',
      syncOutbox: 'id, entityKey, entityType, status, updatedAt',
      syncVersions: 'key, entityType, entityId',
      syncMetadata: 'key, updatedAt',
    })
    this.version(6).stores({
      resources: 'id, canonicalUrl, domain, capturedAt, lastSeenAt',
      resourceContents: 'resourceId, capturedAt, contentHash',
      resourceSummaries: 'resourceId, contentHash, updatedAt',
      sessions: 'id, kind, updatedAt',
      cloudBookmarks: 'id, canonicalUrl, folder, archived, updatedAt',
      settings: 'key, updatedAt',
      actionPlans: 'id, createdAt, risk',
      syncOutbox: 'id, entityKey, entityType, status, updatedAt',
      syncVersions: 'key, entityType, entityId',
      syncMetadata: 'key, updatedAt',
    })
    this.version(7).stores({
      resources: 'id, canonicalUrl, domain, capturedAt, lastSeenAt',
      resourceContents: 'resourceId, capturedAt, contentHash',
      resourceSummaries: 'resourceId, contentHash, updatedAt',
      resourceEmbeddings: 'resourceId, contentHash, model, updatedAt',
      sessions: 'id, kind, updatedAt',
      cloudBookmarks: 'id, canonicalUrl, folder, archived, updatedAt',
      settings: 'key, updatedAt',
      actionPlans: 'id, createdAt, risk',
      syncOutbox: 'id, entityKey, entityType, status, updatedAt',
      syncVersions: 'key, entityType, entityId',
      syncMetadata: 'key, updatedAt',
    })
  }
}

export const db = new ATabDatabase()
