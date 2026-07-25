export const TAB_GROUP_COLORS = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
] as const

export type TabGroupColor = (typeof TAB_GROUP_COLORS)[number]
export type AgentRisk = 'read-only' | 'reversible' | 'destructive'

export interface AgentTabContext {
  id: number
  title: string
  url: string
  active: boolean
  pinned: boolean
  audible: boolean
  muted: boolean
}

export interface AgentPlanRequest {
  command: string
  tabs: AgentTabContext[]
  locale?: string
}

export type AgentOperation =
  | {
      type: 'CREATE_GROUP'
      tabIds: number[]
      name: string
      color: TabGroupColor
    }
  | {
      type: 'CLOSE_TABS'
      tabIds: number[]
    }
  | {
      type: 'MUTE_TABS'
      tabIds: number[]
    }

export interface AgentWireOperation {
  type: 'CREATE_GROUP' | 'CLOSE_TABS' | 'MUTE_TABS'
  tabIds: number[]
  name: string | null
  color: TabGroupColor | null
}

export interface AgentPlanDraft {
  summary: string
  reason: string
  risk: AgentRisk
  requiresConfirmation: boolean
  operations: AgentWireOperation[]
}

export interface AgentActionPlan {
  id: string
  summary: string
  reason: string
  risk: AgentRisk
  requiresConfirmation: boolean
  createdAt: string
  operations: AgentOperation[]
}

export const AGENT_PLAN_DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'reason', 'risk', 'requiresConfirmation', 'operations'],
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 300 },
    reason: { type: 'string', minLength: 1, maxLength: 1200 },
    risk: { type: 'string', enum: ['read-only', 'reversible', 'destructive'] },
    requiresConfirmation: { type: 'boolean' },
    operations: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'tabIds', 'name', 'color'],
        properties: {
          type: {
            type: 'string',
            enum: ['CREATE_GROUP', 'CLOSE_TABS', 'MUTE_TABS'],
          },
          tabIds: {
            type: 'array',
            maxItems: 500,
            items: { type: 'integer', minimum: 0 },
          },
          name: { type: ['string', 'null'], maxLength: 80 },
          color: {
            type: ['string', 'null'],
            enum: [...TAB_GROUP_COLORS, null],
          },
        },
      },
    },
  },
} as const

const MAX_COMMAND_LENGTH = 2_000
const MAX_TABS = 500
const MAX_OPERATIONS = 20
const MAX_TAB_IDS_PER_OPERATION = 500

export function validateAgentPlanRequest(value: unknown): AgentPlanRequest {
  const input = asObject(value, '请求')
  const command = readString(input.command, 'command', MAX_COMMAND_LENGTH)
  if (!command.trim()) throw new Error('command 不能为空')
  if (!Array.isArray(input.tabs)) throw new Error('tabs 必须是数组')
  if (input.tabs.length > MAX_TABS) throw new Error(`tabs 不能超过 ${MAX_TABS} 项`)

  const seenIds = new Set<number>()
  const tabs = input.tabs.map((tab, index) => {
    const item = asObject(tab, `tabs[${index}]`)
    const id = readTabId(item.id, `tabs[${index}].id`)
    if (seenIds.has(id)) throw new Error(`tabs 中存在重复 ID：${id}`)
    seenIds.add(id)
    return {
      id,
      title: readString(item.title, `tabs[${index}].title`, 1_000, true),
      url: readString(item.url, `tabs[${index}].url`, 8_000, true),
      active: readBoolean(item.active, `tabs[${index}].active`),
      pinned: readBoolean(item.pinned, `tabs[${index}].pinned`),
      audible: readBoolean(item.audible, `tabs[${index}].audible`),
      muted: readBoolean(item.muted, `tabs[${index}].muted`),
    }
  })

  const locale = input.locale === undefined
    ? undefined
    : readString(input.locale, 'locale', 32)

  return {
    command: command.trim(),
    tabs,
    locale,
  }
}

export function normalizeAgentPlanDraft(
  value: unknown,
  allowedTabIds: Iterable<number>,
  now = new Date(),
): AgentActionPlan {
  const input = asObject(value, 'AI 计划')
  const summary = readString(input.summary, 'summary', 300)
  const reason = readString(input.reason, 'reason', 1_200)
  if (!Array.isArray(input.operations)) throw new Error('operations 必须是数组')
  if (input.operations.length > MAX_OPERATIONS) {
    throw new Error(`operations 不能超过 ${MAX_OPERATIONS} 项`)
  }

  const allowed = new Set(allowedTabIds)
  const operations: AgentOperation[] = []

  for (const [index, operation] of input.operations.entries()) {
    const item = asObject(operation, `operations[${index}]`)
    const type = readOperationType(item.type, `operations[${index}].type`)
    if (!Array.isArray(item.tabIds)) {
      throw new Error(`operations[${index}].tabIds 必须是数组`)
    }
    if (item.tabIds.length > MAX_TAB_IDS_PER_OPERATION) {
      throw new Error(`operations[${index}].tabIds 数量过多`)
    }

    const tabIds = [...new Set(item.tabIds.map((id, tabIndex) => {
      const parsed = readTabId(id, `operations[${index}].tabIds[${tabIndex}]`)
      if (!allowed.has(parsed)) throw new Error(`计划引用了请求范围外的标签 ID：${parsed}`)
      return parsed
    }))]

    if (tabIds.length === 0) continue

    if (type === 'CREATE_GROUP') {
      const name = readString(item.name, `operations[${index}].name`, 80)
      const color = readTabGroupColor(item.color, `operations[${index}].color`)
      operations.push({ type, tabIds, name, color })
      continue
    }

    operations.push({ type, tabIds })
  }

  const risk = deriveRisk(operations)
  return {
    id: crypto.randomUUID(),
    summary: summary.trim(),
    reason: reason.trim(),
    risk,
    requiresConfirmation: operations.length > 0,
    createdAt: now.toISOString(),
    operations,
  }
}

export function parseAgentActionPlanResponse(
  value: unknown,
  allowedTabIds: Iterable<number>,
): AgentActionPlan {
  const input = asObject(value, 'AI 响应')
  return normalizeAgentPlanDraft({
    summary: input.summary,
    reason: input.reason,
    risk: input.risk,
    requiresConfirmation: input.requiresConfirmation,
    operations: input.operations,
  }, allowedTabIds)
}

function deriveRisk(operations: AgentOperation[]): AgentRisk {
  if (operations.some((operation) => operation.type === 'CLOSE_TABS')) return 'destructive'
  if (operations.length > 0) return 'reversible'
  return 'read-only'
}

function readOperationType(
  value: unknown,
  label: string,
): AgentWireOperation['type'] {
  if (value === 'CREATE_GROUP' || value === 'CLOSE_TABS' || value === 'MUTE_TABS') {
    return value
  }
  throw new Error(`${label} 不在允许的操作白名单中`)
}

function readTabGroupColor(value: unknown, label: string): TabGroupColor {
  if (typeof value === 'string' && TAB_GROUP_COLORS.includes(value as TabGroupColor)) {
    return value as TabGroupColor
  }
  throw new Error(`${label} 不是有效的标签组颜色`)
}

function readTabId(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} 必须是非负整数`)
  }
  return value
}

function readBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} 必须是布尔值`)
  return value
}

function readString(
  value: unknown,
  label: string,
  maxLength: number,
  allowEmpty = false,
): string {
  if (typeof value !== 'string') throw new Error(`${label} 必须是字符串`)
  if (!allowEmpty && !value.trim()) throw new Error(`${label} 不能为空`)
  if (value.length > maxLength) throw new Error(`${label} 过长`)
  return value
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`)
  }
  return value as Record<string, unknown>
}
