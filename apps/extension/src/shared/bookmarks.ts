import type { BookmarkNodeView } from './domain'

export interface FlatBookmarkNode extends BookmarkNodeView {
  depth: number
}

export function flattenBookmarkTree(
  nodes: BookmarkNodeView[],
  depth = 0,
): FlatBookmarkNode[] {
  return nodes.flatMap((node) => [
    { ...node, depth },
    ...flattenBookmarkTree(node.children, depth + 1),
  ])
}

export function findBookmarkNode(
  nodes: BookmarkNodeView[],
  id: string,
): BookmarkNodeView | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    const child = findBookmarkNode(node.children, id)
    if (child) return child
  }
  return undefined
}

export function collectBookmarkDescendantIds(node: BookmarkNodeView): Set<string> {
  const ids = new Set<string>()
  for (const child of node.children) {
    ids.add(child.id)
    for (const id of collectBookmarkDescendantIds(child)) ids.add(id)
  }
  return ids
}

export function getBookmarkMoveTargets(
  nodes: BookmarkNodeView[],
  movingId: string,
): FlatBookmarkNode[] {
  const moving = findBookmarkNode(nodes, movingId)
  const blocked = new Set<string>([movingId])
  if (moving) {
    for (const id of collectBookmarkDescendantIds(moving)) blocked.add(id)
  }

  return flattenBookmarkTree(nodes).filter(
    (node) => !node.url && !blocked.has(node.id),
  )
}

export function normalizeBookmarkUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('请输入网址')

  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  const url = new URL(withScheme)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('仅支持 HTTP 或 HTTPS 网址')
  }
  return url.toString()
}
