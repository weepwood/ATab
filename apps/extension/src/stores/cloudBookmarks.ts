import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { browserGateway } from '@/shared/browser'
import { db } from '@/shared/db'
import type {
  CloudBookmarkImportCandidate,
  CloudBookmarkRecord,
} from '@/shared/domain'
import {
  collectCloudBookmarkImportCandidates,
  filterCloudBookmarks,
  listCloudBookmarkFolders,
  type CloudBookmarkInput,
} from '@/shared/cloudBookmarks'
import {
  createCloudBookmark,
  deleteCloudBookmark,
  importBrowserBookmarks,
  updateCloudBookmark,
} from '@/shared/cloudBookmarkService'

export const useCloudBookmarksStore = defineStore('cloud-bookmarks', () => {
  const records = ref<CloudBookmarkRecord[]>([])
  const query = ref('')
  const selectedFolder = ref('')
  const includeArchived = ref(false)
  const loading = ref(false)
  const mutating = ref(false)
  const error = ref('')
  const importCandidates = ref<CloudBookmarkImportCandidate[]>([])
  const selectedImportIds = ref<string[]>([])
  const lastImportResult = ref<{ created: number; skipped: number } | null>(null)

  const filteredRecords = computed(() => filterCloudBookmarks(records.value, {
    query: query.value,
    folder: selectedFolder.value,
    includeArchived: includeArchived.value,
  }))
  const folders = computed(() => listCloudBookmarkFolders(records.value))
  const importableCandidates = computed(() => importCandidates.value.filter((item) => !item.duplicate))

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      records.value = await db.cloudBookmarks.orderBy('updatedAt').reverse().toArray()
    } catch (cause) {
      error.value = messageOf(cause)
    } finally {
      loading.value = false
    }
  }

  async function runMutation(action: () => Promise<void>): Promise<void> {
    mutating.value = true
    error.value = ''
    try {
      await action()
      await refresh()
    } catch (cause) {
      error.value = messageOf(cause)
      throw cause
    } finally {
      mutating.value = false
    }
  }

  async function create(input: CloudBookmarkInput): Promise<void> {
    await runMutation(async () => {
      await createCloudBookmark(input)
    })
  }

  async function update(record: CloudBookmarkRecord, input: CloudBookmarkInput): Promise<void> {
    await runMutation(async () => {
      await updateCloudBookmark(record, input)
    })
  }

  async function toggleArchived(record: CloudBookmarkRecord): Promise<void> {
    await update(record, {
      ...record,
      archived: !record.archived,
    })
  }

  async function remove(record: CloudBookmarkRecord): Promise<void> {
    await runMutation(async () => {
      await deleteCloudBookmark(record)
    })
  }

  async function open(record: CloudBookmarkRecord): Promise<void> {
    await browserGateway.openBookmark(record.url)
  }

  async function prepareImport(): Promise<void> {
    mutating.value = true
    error.value = ''
    lastImportResult.value = null
    try {
      const tree = await browserGateway.listBookmarks()
      importCandidates.value = collectCloudBookmarkImportCandidates(
        tree,
        records.value.map((record) => record.canonicalUrl),
      )
      selectedImportIds.value = importCandidates.value
        .filter((item) => !item.duplicate)
        .map((item) => item.sourceBookmarkId)
    } catch (cause) {
      error.value = messageOf(cause)
    } finally {
      mutating.value = false
    }
  }

  function toggleImport(sourceBookmarkId: string): void {
    selectedImportIds.value = selectedImportIds.value.includes(sourceBookmarkId)
      ? selectedImportIds.value.filter((id) => id !== sourceBookmarkId)
      : [...selectedImportIds.value, sourceBookmarkId]
  }

  function selectAllImportable(): void {
    selectedImportIds.value = importableCandidates.value.map((item) => item.sourceBookmarkId)
  }

  async function importSelected(): Promise<void> {
    const selected = new Set(selectedImportIds.value)
    await runMutation(async () => {
      lastImportResult.value = await importBrowserBookmarks(
        importCandidates.value
          .filter((item) => selected.has(item.sourceBookmarkId))
          .map((item) => ({ ...item, duplicate: false })),
      )
      importCandidates.value = []
      selectedImportIds.value = []
    })
  }

  function cancelImport(): void {
    importCandidates.value = []
    selectedImportIds.value = []
  }

  return {
    records,
    query,
    selectedFolder,
    includeArchived,
    loading,
    mutating,
    error,
    importCandidates,
    selectedImportIds,
    lastImportResult,
    filteredRecords,
    folders,
    importableCandidates,
    refresh,
    create,
    update,
    toggleArchived,
    remove,
    open,
    prepareImport,
    toggleImport,
    selectAllImportable,
    importSelected,
    cancelImport,
  }
})

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : '云收藏操作失败'
}
