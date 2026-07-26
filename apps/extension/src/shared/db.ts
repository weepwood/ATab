import Dexie, { type EntityTable } from 'dexie'
import type { AiActionPlan, ResourceRecord, SessionRecord } from './domain'

export interface SettingRecord {
  key: string
  value: unknown
  updatedAt: string
}

class ATabDatabase extends Dexie {
  resources!: EntityTable<ResourceRecord, 'id'>
  sessions!: EntityTable<SessionRecord, 'id'>
  settings!: EntityTable<SettingRecord, 'key'>
  actionPlans!: EntityTable<AiActionPlan, 'id'>

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
  }
}

export const db = new ATabDatabase()
