// src/core/rag/text-processor.ts
// 文本预处理和关键词提取

/**
 * 文本预处理和关键词提取
 * 简单实现，不依赖外部 NLP 库
 */
export class TextProcessor {
  // 中文停用词表 (简化版)
  private static STOP_WORDS = new Set([
    '的', '是', '在', '了', '和', '与', '或', '有', '我', '你', '他', '她', '它',
    '这', '那', '什么', '怎么', '如何', '为什么', '哪', '谁', '哪', '几', '多',
    '很', '非常', '太', '最', '更', '还', '也', '都', '就', '才', '只', '不',
    '要', '会', '能', '可以', '应该', '必须', '得', '让', '把', '给', '被',
    '从', '到', '对', '向', '往', '在', '于', '为', '以', '因', '由',
    '但', '但是', '却', '虽然', '即使', '如果', '假如', '只要', '无论',
    '因为', '所以', '因此', '于是', '那么', '然后', '接着', '最后',
    '一个', '一些', '那种', '这种', '那个', '哪个', '哪些', '多少',
    '已经', '正在', '将', '将要', '曾经', '一直', '总是', '从来',
    '的话', '来说', '起来', '下去', '出去', '进来', '出来',
    '一下', '一点', '一些', '一边', '一面', '一起', '一块',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'can', 'to', 'of',
    'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
    'through', 'during', 'before', 'after', 'above', 'below', 'between',
    'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
    'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just'
  ])

  /**
   * 提取关键词
   * 使用简单的分词 + 词频统计
   */
  extractKeywords(text: string, maxKeywords: number = 20): string[] {
    // 1. 清理文本
    const cleanText = this.cleanText(text)

    // 2. 分词 (简单实现: 中文按字符，英文按空格)
    const tokens = this.tokenize(cleanText)

    // 3. 过滤停用词和短词
    const filtered = tokens.filter(
      (t) => t.length >= 2 && !TextProcessor.STOP_WORDS.has(t.toLowerCase())
    )

    // 4. 统计词频
    const freq = new Map<string, number>()
    for (const token of filtered) {
      freq.set(token, (freq.get(token) || 0) + 1)
    }

    // 5. 按词频排序，取前 N 个
    const sorted = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([word]) => word)

    return sorted
  }

  /**
   * 分块处理长文本
   */
  chunkText(text: string, chunkSize: number = 500, overlap: number = 50): string[] {
    const chunks: string[] = []
    let start = 0

    while (start < text.length) {
      let end = start + chunkSize

      // 尝试在句子边界切分
      if (end < text.length) {
        const searchStart = Math.max(start + chunkSize - 100, start)
        const searchEnd = Math.min(start + chunkSize + 100, text.length)
        const searchRegion = text.slice(searchStart, searchEnd)

        // 查找句子结束符
        const sentenceEnd = /[。！？.!?\n]/.exec(searchRegion)
        if (sentenceEnd) {
          end = searchStart + sentenceEnd.index + 1
        }
      }

      chunks.push(text.slice(start, end).trim())
      start = Math.max(end - overlap, end) // 防止负数
    }

    return chunks.filter((c) => c.length > 0)
  }

  /**
   * 清理文本
   */
  private cleanText(text: string): string {
    return text
      .replace(/```[\s\S]*?```/g, '') // 移除代码块
      .replace(/`[^`]+`/g, '') // 移除行内代码
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 提取链接文本
      .replace(/[#*_~`>|]/g, '') // 移除 Markdown 标记
      .replace(/\s+/g, ' ') // 合并空白
      .trim()
  }

  /**
   * 简单分词
   */
  private tokenize(text: string): string[] {
    const tokens: string[] = []

    // 中文按字符分词 (简单实现)
    const chinesePattern = /[一-龥]+/g
    // 英文按单词分词
    const englishPattern = /[a-zA-Z]+/g

    // 提取中文词汇 (简单按 2-4 字组合)
    const chineseMatches = text.match(chinesePattern) || []
    for (const match of chineseMatches) {
      if (match.length <= 4) {
        tokens.push(match)
      } else {
        // 滑动窗口生成词组
        for (let i = 0; i <= match.length - 2; i++) {
          tokens.push(match.slice(i, i + 2))
        }
        for (let i = 0; i <= match.length - 3; i++) {
          tokens.push(match.slice(i, i + 3))
        }
      }
    }

    // 提取英文词汇
    const englishMatches = text.match(englishPattern) || []
    tokens.push(...englishMatches)

    return tokens
  }
}