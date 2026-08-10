import type { Editor, Range } from '@tiptap/core'
import {
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  List,
  ListChecks,
  ListOrdered,
  type LucideIcon,
  Minus,
  Pilcrow,
  Table as TableIcon,
  TextQuote,
} from 'lucide-react'

export interface SlashCommandContext {
  editor: Editor
  range: Range
}

/**
 * Per-editor storage on the `slashCommand` extension. The host editor component sets `insertImage`
 * after mount; it opens an image file picker and uploads + inserts the chosen image(s) at `at`. Null
 * in headless/read-only contexts, where the Image command is a no-op.
 */
export interface SlashCommandStorage {
  insertImage: ((at: number) => void) | null
}

export interface SlashCommandItem {
  title: string
  /** Group heading the item is shown under in the menu. */
  group: string
  icon: LucideIcon
  /** Extra search terms matched against the slash query, beyond the title. */
  aliases: string[]
  /** Keyboard shortcut shown on the right of the item (omitted when there is none). */
  shortcut?: string
  run: (ctx: SlashCommandContext) => void
}

/**
 * The blocks insertable via the `/` menu. Each `run` first deletes the typed `/query`
 * (`deleteRange(range)`) so the command replaces the trigger text rather than appending.
 * Kept to blocks that round-trip cleanly through markdown — no media/embeds.
 */
export const SLASH_COMMANDS: readonly SlashCommandItem[] = [
  {
    title: '文本',
    group: '基础',
    icon: Pilcrow,
    aliases: ['paragraph', 'body'],
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: '标题 1',
    group: '基础',
    icon: Heading1,
    aliases: ['h1', 'title'],
    shortcut: '⌘⌥1',
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
  },
  {
    title: '标题 2',
    group: '基础',
    icon: Heading2,
    aliases: ['h2', 'subtitle'],
    shortcut: '⌘⌥2',
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
  },
  {
    title: '标题 3',
    group: '基础',
    icon: Heading3,
    aliases: ['h3'],
    shortcut: '⌘⌥3',
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
  },
  {
    title: '无序列表',
    group: '列表',
    icon: List,
    aliases: ['unordered', 'ul', 'bullet'],
    shortcut: '⌘⇧8',
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: '有序列表',
    group: '列表',
    icon: ListOrdered,
    aliases: ['ordered', 'ol'],
    shortcut: '⌘⇧7',
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: '任务清单',
    group: '列表',
    icon: ListChecks,
    aliases: ['todo', 'task', 'checkbox'],
    shortcut: '⌘⇧9',
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: '引用',
    group: '块',
    icon: TextQuote,
    aliases: ['blockquote', 'citation'],
    shortcut: '⌘⇧B',
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: '代码块',
    group: '块',
    icon: Code2,
    aliases: ['codeblock', 'snippet', 'fence'],
    shortcut: '⌘⌥C',
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: '表格',
    group: '块',
    icon: TableIcon,
    aliases: ['grid', 'rows', 'columns'],
    run: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    title: '分隔线',
    group: '块',
    icon: Minus,
    aliases: ['hr', 'horizontal rule', 'separator'],
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: '图片',
    group: '媒体',
    icon: ImageIcon,
    aliases: ['picture', 'photo', 'upload', 'img'],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run()
      editor.storage.slashCommand.insertImage?.(editor.state.selection.from)
    },
  },
]

/**
 * Filters commands by a case-insensitive match against title or aliases. Order is preserved so the
 * menu stays stable as the query narrows. The Image command is dropped when image insertion isn't
 * available (`allowImages: false`) — e.g. the modal field editors, which have no upload affordance.
 */
export function filterSlashCommands(
  query: string,
  options?: { allowImages?: boolean }
): SlashCommandItem[] {
  const allowImages = options?.allowImages ?? true
  const available = allowImages ? SLASH_COMMANDS : SLASH_COMMANDS.filter((c) => c.title !== '图片')
  const q = query.trim().toLowerCase()
  if (!q) return [...available]
  return available.filter(
    (command) =>
      command.title.toLowerCase().includes(q) || command.aliases.some((alias) => alias.includes(q))
  )
}
