/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildUpgradeHref,
  isUpgradeReason,
  UPGRADE_REASON_COPY,
  UPGRADE_REASONS,
} from '@/lib/billing/upgrade-reasons'

describe('upgrade-reasons', () => {
  it('has copy for every reason', () => {
    for (const reason of UPGRADE_REASONS) {
      const copy = UPGRADE_REASON_COPY[reason]
      expect(copy.header).toMatch(/^升级以/)
      expect(copy.noun.length).toBeGreaterThan(0)
      expect(copy.warningSubject.length).toBeGreaterThan(0)
      expect(copy.reachedSubject.length).toBeGreaterThan(0)
    }
  })

  it('uses Emir’s header wording', () => {
    expect(UPGRADE_REASON_COPY.seats.header).toBe('升级以与你的团队成员共同扩展')
    expect(UPGRADE_REASON_COPY.tables.header).toBe('升级以扩展你的表格')
    expect(UPGRADE_REASON_COPY.storage.header).toBe('升级以扩展你的存储')
  })

  it('builds hrefs with and without a reason', () => {
    expect(buildUpgradeHref('ws-1')).toBe('/workspace/ws-1/upgrade')
    expect(buildUpgradeHref('ws-1', 'tables')).toBe('/workspace/ws-1/upgrade?reason=tables')
  })

  it('guards known reasons', () => {
    expect(isUpgradeReason('storage')).toBe(true)
    expect(isUpgradeReason('seats')).toBe(true)
    expect(isUpgradeReason('bogus')).toBe(false)
    expect(isUpgradeReason(null)).toBe(false)
  })
})
