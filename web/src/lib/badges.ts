import type { LeaderboardRow, LeaderboardWindow } from './api'

export type BadgeKey =
  | 'daily-mvp'
  | 'marathon'
  | 'half-k'
  | 'century'
  | 'clean-run'
  | 'pack-pro'

export interface BadgeMeta {
  key: BadgeKey
  label: string
  description: string
  imageUrl: string
  tier: 'gold' | 'silver' | 'bronze'
}

export const BADGES: Record<BadgeKey, BadgeMeta> = {
  'daily-mvp': {
    key: 'daily-mvp',
    label: 'Daily MVP',
    description: '#1 picker today',
    imageUrl: '/badges/daily-mvp.png?v=3',
    tier: 'gold',
  },
  marathon: {
    key: 'marathon',
    label: 'Marathon',
    description: '1,000+ items picked today',
    imageUrl: '/badges/marathon.png?v=3',
    tier: 'gold',
  },
  'half-k': {
    key: 'half-k',
    label: 'Half-K',
    description: '500+ items picked today',
    imageUrl: '/badges/half-k.png?v=3',
    tier: 'silver',
  },
  'pack-pro': {
    key: 'pack-pro',
    label: 'Pack Pro',
    description: '100+ orders despatched today',
    imageUrl: '/badges/pack-pro.png?v=3',
    tier: 'silver',
  },
  century: {
    key: 'century',
    label: 'Century',
    description: '100+ items picked today',
    imageUrl: '/badges/century.png?v=3',
    tier: 'bronze',
  },
  'clean-run': {
    key: 'clean-run',
    label: 'Clean Run',
    description: '50+ items picked, 0 skipped',
    imageUrl: '/badges/clean-run.png?v=3',
    tier: 'bronze',
  },
}

/**
 * Returns the set of badge keys a picker has earned in the given window.
 * Currently only the today window earns badges — week/month require
 * different thresholds we haven't designed yet.
 *
 * For tiered "items picked" badges (century / half-k / marathon) only
 * the highest tier earned is returned so the row doesn't pile up
 * three icons that all mean "they picked a lot".
 */
export function badgesFor(
  row: LeaderboardRow,
  rank: number,
  window: LeaderboardWindow,
): BadgeKey[] {
  if (window !== 'today') return []
  const earned: BadgeKey[] = []

  // Daily MVP — rank 1 picker with real activity
  if (rank === 1 && row.items_picked > 0) earned.push('daily-mvp')

  // Tiered item-count badges — only the highest earned tier
  if (row.items_picked >= 1000) earned.push('marathon')
  else if (row.items_picked >= 500) earned.push('half-k')
  else if (row.items_picked >= 100) earned.push('century')

  // Clean Run — need a meaningful pick count AND zero skips
  if (row.items_picked >= 50 && row.items_skipped === 0) earned.push('clean-run')

  // Pack Pro — strong packing performance
  if (row.orders_despatched >= 100) earned.push('pack-pro')

  return earned
}
