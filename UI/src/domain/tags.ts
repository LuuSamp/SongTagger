import { TAG_KINDS, type Tag, type TagKind, type UserTag } from './types'

export const TAG_KIND_LABELS: Record<TagKind, string> = {
  artist: 'Artist',
  genre: 'Genre',
  feeling: 'Feeling',
  instrument: 'Instrument',
}

export function foldText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
}

export function normalizeTagName(value: string): string {
  return foldText(value.replace(/-/g, ' ')).slice(0, 255)
}

export function toToken(value: string): string {
  return normalizeTagName(value).replace(/ /g, '-')
}

export function displayTagName(value: string): string {
  return value.replace(/-/g, ' ').trim().split(/\s+/).filter(Boolean).join(' ').slice(0, 255)
}

export function parseTokens(query: string): string[] {
  const seen = new Set<string>()
  const tokens: string[] = []
  for (const part of query.split(/[\s,]+/)) {
    const token = toToken(part)
    if (token && !seen.has(token)) {
      seen.add(token)
      tokens.push(token)
    }
  }
  return tokens
}

export function isTagKind(value: string): value is TagKind {
  return (TAG_KINDS as readonly string[]).includes(value)
}

export function isAppliedByMe(tag: Tag | UserTag): boolean {
  return 'applied_by_me' in tag && tag.applied_by_me
}

export function tagKey(tag: Pick<Tag, 'kind' | 'token'>): string {
  return `${tag.kind}:${tag.token}`
}

export function groupTagsByKind<T extends Tag>(tags: readonly T[]): Array<[TagKind, T[]]> {
  return TAG_KINDS.map(
    (kind) => [kind, tags.filter((tag) => tag.kind === kind)] as [TagKind, T[]],
  ).filter(([, group]) => group.length > 0)
}

export function sortTags<T extends Tag>(tags: readonly T[]): T[] {
  const order = new Map(TAG_KINDS.map((kind, index) => [kind, index]))
  return [...tags].sort(
    (a, b) => (order.get(a.kind) ?? 0) - (order.get(b.kind) ?? 0) || a.token.localeCompare(b.token),
  )
}

export function sharedTags<T extends Tag>(tags: readonly T[], others: readonly Tag[]): T[] {
  const tokens = new Set(others.map((tag) => tag.token))
  return tags.filter((tag) => tokens.has(tag.token))
}
