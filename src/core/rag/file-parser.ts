// src/core/rag/file-parser.ts
// 多格式文件解析器

import * as fs from 'fs'
import * as path from 'path'
import { FileType, ParsedFile } from './types'

export class FileParser {
  /**
   * 解析文件内容
   * 支持: txt, md, json, docx, xlsx, pdf
   */
  async parse(filePath: string): Promise<ParsedFile> {
    const ext = this.getFileExtension(filePath)

    switch (ext) {
      case 'txt':
      case 'md':
      case 'json':
        return this.parseTextFile(filePath)
      case 'docx':
        return this.parseDocx(filePath)
      case 'xlsx':
      case 'xls':
        return this.parseXlsx(filePath)
      case 'pdf':
        return this.parsePdf(filePath)
      default:
        throw new Error(`Unsupported file type: ${ext}`)
    }
  }

  private getFileExtension(filePath: string): string {
    return filePath.split('.').pop()?.toLowerCase() || ''
  }

  private async parseTextFile(filePath: string): Promise<ParsedFile> {
    const content = await fs.promises.readFile(filePath, 'utf-8')
    const title = this.extractTitle(content, filePath)
    return { content, title }
  }

  private async parseDocx(filePath: string): Promise<ParsedFile> {
    // 动态导入 mammoth (ESM 兼容)
    const mammoth = require('mammoth')
    const result = await mammoth.extractRawText({ path: filePath })
    const content = result.value
    const title = this.extractTitle(content, filePath)
    return { content, title }
  }

  private async parseXlsx(filePath: string): Promise<ParsedFile> {
    const XLSX = require('xlsx')
    const workbook = XLSX.readFile(filePath)
    const sheets: string[] = []

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const csv = XLSX.utils.sheet_to_csv(sheet)
      sheets.push(`【${sheetName}】\n${csv}`)
    }

    const content = sheets.join('\n\n')
    const title = this.extractTitle(content, filePath)
    return { content, title }
  }

  private async parsePdf(filePath: string): Promise<ParsedFile> {
    const pdfParse = require('pdf-parse')
    const buffer = await fs.promises.readFile(filePath)
    const data = await pdfParse(buffer)
    const content = data.text
    const title = this.extractTitle(content, filePath)
    return { content, title, metadata: { info: data.info } }
  }

  private extractTitle(content: string, filePath: string): string {
    // 尝试从内容第一行提取标题
    const firstLine = content.split('\n')[0].trim()
    if (firstLine && firstLine.length < 100) {
      return firstLine.replace(/^#+\s*/, '').substring(0, 50)
    }
    // 使用文件名作为标题
    return path.basename(filePath)
  }

  isSupported(filePath: string): boolean {
    const ext = this.getFileExtension(filePath)
    const supportedTypes = ['txt', 'md', 'markdown', 'json', 'docx', 'xlsx', 'xls', 'pdf']
    return supportedTypes.includes(ext)
  }

  getFileType(filePath: string): FileType {
    const ext = this.getFileExtension(filePath)
    const typeMap: Record<string, FileType> = {
      txt: 'txt',
      md: 'md',
      markdown: 'md',
      json: 'json',
      docx: 'docx',
      xlsx: 'xlsx',
      xls: 'xlsx',
      pdf: 'pdf'
    }
    return typeMap[ext] || 'txt'
  }
}