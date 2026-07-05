// 服务端文件解析适配层
// electron/parsers.ts 的 parseFile 接收文件路径，服务端 multer 给的是 Buffer
// 方案：将 Buffer 写入临时文件 → 调用 parseFile → 删除临时文件
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { parseFile, getFileType } from '../electron/parsers';
import type { ApiConfig } from '../src/shared/types';
import type { ParseResult } from '../electron/parsers';

/** 从 Buffer 解析文件（写入临时文件后复用 parseFile） */
export async function parseBuffer(
  buffer: Buffer,
  filename: string,
  config?: ApiConfig,
): Promise<ParseResult> {
  const ext = path.extname(filename);
  const tmpPath = path.join(os.tmpdir(), `${uuidv4()}${ext}`);
  try {
    fs.writeFileSync(tmpPath, buffer);
    return await parseFile(tmpPath, config);
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // 临时文件清理失败不影响主流程
    }
  }
}

export { getFileType };
