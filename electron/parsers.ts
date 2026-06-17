// 文件解析服务（主进程）：提取 PDF/DOCX/PPTX/TXT/MD 纯文本
import * as fs from 'fs';
import * as path from 'path';

// 使用 require 加载纯 CJS 库，避免 ESM 互操作问题
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mammoth = require('mammoth');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSZip = require('jszip');

export interface ParseResult {
  text: string;
  filetype: string;
}

export function getFileType(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  return ext || 'unknown';
}

export async function parseFile(filePath: string): Promise<ParseResult> {
  const filename = path.basename(filePath);
  const filetype = getFileType(filename);

  switch (filetype) {
    case 'pdf':
      return { text: await parsePdf(filePath), filetype };
    case 'docx':
      return { text: await parseDocx(filePath), filetype };
    case 'pptx':
      return { text: await parsePptx(filePath), filetype };
    case 'txt':
    case 'md':
    case 'markdown':
      return { text: await parseText(filePath), filetype };
    case 'doc':
      // 旧版 .doc 二进制格式暂不支持精确解析，提示用户转 docx
      return {
        text: '[该文件为旧版 .doc 格式，建议另存为 .docx 后上传以获得更好解析效果]',
        filetype,
      };
    default:
      // 尝试作为纯文本读取
      try {
        return { text: await parseText(filePath), filetype };
      } catch {
        return { text: `[暂不支持的文件类型: .${filetype}]`, filetype };
      }
  }
}

async function parsePdf(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return (data.text || '').trim();
}

async function parseDocx(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return (result.value || '').trim();
}

async function parsePptx(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name: string) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a: string, b: string) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
      return na - nb;
    });

  const texts: string[] = [];
  for (const slideFile of slideFiles) {
    const xml = await zip.files[slideFile].async('string');
    const slideTexts = extractTextFromSlideXml(xml);
    if (slideTexts.length) {
      texts.push(slideTexts.join('\n'));
    }
  }
  return texts.join('\n\n---\n\n').trim();
}

function extractTextFromSlideXml(xml: string): string[] {
  const results: string[] = [];
  // 匹配 <a:t>...</a:t> 文本节点
  const regex = /<a:t>([^<]*)<\/a:t>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const text = decodeXmlEntities(match[1]);
    if (text.trim()) results.push(text);
  }
  return results;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function parseText(filePath: string): Promise<string> {
  return fs.readFileSync(filePath, 'utf-8').trim();
}
