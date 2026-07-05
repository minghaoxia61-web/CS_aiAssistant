// 文件解析服务（主进程）：提取 PDF/DOCX/PPTX/TXT/MD/图片 纯文本
import * as fs from 'fs';
import * as path from 'path';
import type { ApiConfig } from '../src/shared/types';
import { visionJSON } from './llm';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import JSZip from 'jszip';

export interface ParseResult {
  text: string;
  filetype: string;
}

export function getFileType(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  return ext || 'unknown';
}

export async function parseFile(filePath: string, config?: ApiConfig): Promise<ParseResult> {
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
    case 'jpg':
    case 'jpeg':
    case 'png':
      return { text: await parseImage(filePath, config), filetype };
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
  for (let i = 0; i < slideFiles.length; i++) {
    const slideFile = slideFiles[i];
    const pageNum = i + 1;
    const xml = await zip.files[slideFile].async('string');
    const slideTexts = extractTextFromSlideXml(xml);
    if (slideTexts.length) {
      // 每页标注页码，便于分块后 AI 引用来源页码
      texts.push(`[Page ${pageNum}]\n${slideTexts.join('\n')}`);
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
  const buffer = fs.readFileSync(filePath);
  // 优先尝试 UTF-8
  const utf8 = buffer.toString('utf-8');
  // 如果没有替换字符（U+FFFD），说明 UTF-8 解码正确
  if (!utf8.includes('\uFFFD')) {
    return utf8.trim();
  }
  // 否则尝试 GBK（Windows 上中文 txt 常见编码）
  try {
    const decoder = new TextDecoder('gbk');
    const gbk = decoder.decode(buffer);
    if (!gbk.includes('\uFFFD')) {
      return gbk.trim();
    }
  } catch {
    // TextDecoder 不支持 gbk，忽略
  }
  return utf8.trim();
}

/**
 * 图片 OCR：将图片转为 base64，通过视觉大模型识别提取文字。
 * 不引入外部 OCR 库，复用已配置的 LLM API。
 * 智谱（bigmodel.cn）默认配置自动切换到免费视觉模型 glm-4v-flash。
 */
async function parseImage(filePath: string, config?: ApiConfig): Promise<string> {
  if (!config || !config.apiKey) {
    return '[图片 OCR 需要配置 API，请在设置页配置 LLM API 后重新上传该图片]';
  }
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  const base64 = buffer.toString('base64');
  const dataUrl = `data:${mime};base64,${base64}`;

  // 智谱 GLM-4-Flash 为纯文本模型，需切换到视觉模型 glm-4v-flash（免费额度）
  const isZhipu = config.baseUrl.includes('bigmodel.cn');
  const visionConfig: ApiConfig = {
    ...config,
    model: isZhipu ? 'glm-4v-flash' : config.model,
  };

  try {
    const text = await visionJSON({
      config: visionConfig,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '请识别并提取这张图片中的所有文字内容，保持原始结构、排版与层级。只输出识别到的文字，不要添加任何解释或前后缀说明。如果图片中没有文字（如纯图表/示意图），请简要描述图片所表达的内容。',
            },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 0.1,
      maxTokens: 2000,
    });
    return (text || '').trim() || '[图片未识别到文字内容]';
  } catch (e) {
    return `[图片 OCR 失败：${(e as Error).message}]`;
  }
}
