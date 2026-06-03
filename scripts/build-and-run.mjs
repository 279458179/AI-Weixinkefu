// scripts/build-and-run.mjs
// 编译并自动打开 exe

import { execSync } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

console.log('🔧 开始编译...')
console.log()

try {
  // 1. 编译打包
  execSync('npm run build:win', { cwd: rootDir, stdio: 'inherit' })

  console.log()
  console.log('✅ 编译完成!')

  // 2. 找到 exe 文件并打开
  const distDir = join(rootDir, 'dist')
  const files = existsSync(distDir)
    ? readdirSync(distDir).filter(f => f.endsWith('.exe') && !f.includes('.exe.blockmap') && !f.includes('blocked'))
    : []

  if (files.length > 0) {
    const exePath = join(distDir, files[0])
    console.log(`🚀 正在打开: ${files[0]}`)

    // Windows 使用 start 命令打开
    execSync(`start "" "${exePath}"`, { cwd: rootDir, shell: 'cmd.exe' })
  } else {
    console.log('⚠️  未找到 exe 文件')
  }
} catch (error) {
  console.error('❌ 编译失败:', error.message)
  process.exit(1)
}