/**
 * @vitest-environment node
 */
import type { Editor, Range } from '@tiptap/core'
import { describe, expect, it, vi } from 'vitest'
import { filterSlashCommands, SLASH_COMMANDS } from './commands'

describe('filterSlashCommands', () => {
  it('returns a copy of all commands for an empty query', () => {
    const all = filterSlashCommands('')
    expect(all).toHaveLength(SLASH_COMMANDS.length)
    expect(all).not.toBe(SLASH_COMMANDS)
  })

  it('matches on title case-insensitively', () => {
    expect(filterSlashCommands('标题').map((c) => c.title)).toEqual([
      '标题 1',
      '标题 2',
      '标题 3',
    ])
  })

  it('matches on alias', () => {
    expect(filterSlashCommands('todo').map((c) => c.title)).toContain('任务清单')
    expect(filterSlashCommands('hr').map((c) => c.title)).toContain('分隔线')
  })

  it('trims whitespace in the query', () => {
    expect(filterSlashCommands('  表格 ').map((c) => c.title)).toEqual(['表格'])
  })

  it('returns empty for no match', () => {
    expect(filterSlashCommands('zzz')).toEqual([])
  })

  it('drops the Image command when image insertion is disallowed', () => {
    expect(filterSlashCommands('', { allowImages: false }).map((c) => c.title)).not.toContain(
      '图片'
    )
    expect(filterSlashCommands('图片', { allowImages: false })).toEqual([])
    expect(filterSlashCommands('图片', { allowImages: true }).map((c) => c.title)).toContain(
      '图片'
    )
  })
})

describe('SLASH_COMMANDS registry', () => {
  it('every command has the required fields', () => {
    for (const command of SLASH_COMMANDS) {
      expect(command.title).toBeTruthy()
      expect(command.group).toBeTruthy()
      expect(command.icon).toBeTruthy()
      expect(Array.isArray(command.aliases)).toBe(true)
      expect(typeof command.run).toBe('function')
    }
  })

  it('has unique titles (stable React keys)', () => {
    const titles = SLASH_COMMANDS.map((c) => c.title)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('Image command replaces the trigger and hands the caret to the host insertImage handler', () => {
    const insertImage = vi.fn()
    const deleteRange = vi.fn(() => chain)
    const chain = { focus: () => chain, deleteRange, run: () => true }
    const editor = {
      chain: () => chain,
      storage: { slashCommand: { insertImage } },
      state: { selection: { from: 7 } },
    } as unknown as Editor

    const image = SLASH_COMMANDS.find((c) => c.title === '图片')
    expect(image).toBeDefined()
    image?.run({ editor, range: { from: 5, to: 6 } as Range })

    expect(deleteRange).toHaveBeenCalledWith({ from: 5, to: 6 })
    expect(insertImage).toHaveBeenCalledWith(7)
  })

  it('Image command is a no-op when no handler is wired', () => {
    const chain = { focus: () => chain, deleteRange: () => chain, run: () => true }
    const editor = {
      chain: () => chain,
      storage: { slashCommand: { insertImage: null } },
      state: { selection: { from: 0 } },
    } as unknown as Editor
    expect(() =>
      SLASH_COMMANDS.find((c) => c.title === '图片')?.run({
        editor,
        range: { from: 0, to: 1 } as Range,
      })
    ).not.toThrow()
  })
})
