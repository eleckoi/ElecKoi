import { existsSync, lstatSync, readdirSync, rmSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

/** Only per-conversation directories created by the desktop runtime are owned here. */
export class ConversationFiles {
  constructor(private readonly roots: readonly string[]) {}

  remove(id: string): void {
    if (!/^[a-zA-Z0-9_-]{1,96}$/.test(id)) throw new Error('会话文件编号无效。')
    for (const root of this.roots) {
      const base = resolve(root)
      const target = resolve(base, id)
      const child = relative(base, target)
      if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('会话目录越界。')
      if (!existsSync(target)) continue
      this.assertNoLinks(base)
      this.assertTree(target)
      rmSync(target, { recursive: true, force: true })
    }
  }

  private assertNoLinks(path: string): void {
    if (lstatSync(path).isSymbolicLink()) throw new Error('会话清理不跟随符号链接或目录联接。')
  }

  private assertTree(path: string): void {
    this.assertNoLinks(path)
    if (!lstatSync(path).isDirectory()) return
    for (const name of readdirSync(path)) this.assertTree(join(path, name))
  }
}
