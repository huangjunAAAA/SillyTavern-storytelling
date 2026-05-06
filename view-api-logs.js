#!/usr/bin/env node

/**
 * API 日志查看工具
 * 
 * 用法:
 *   node view-api-logs.js [选项]
 * 
 * 选项:
 *   --latest     查看最新的日志文件
 *   --count N    显示最近 N 个日志文件的摘要
 *   --search KEY 搜索包含指定关键词的日志
 *   --help       显示帮助信息
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_DIR = path.join(__dirname, 'logs', 'api-requests');

/**
 * 获取所有日志文件
 */
function getLogFiles() {
    if (!fs.existsSync(LOG_DIR)) {
        console.log('日志目录不存在:', LOG_DIR);
        return [];
    }

    const files = fs.readdirSync(LOG_DIR)
        .filter(file => file.endsWith('.json') || file.endsWith('.jsonl'))
        .map(file => ({
            name: file,
            path: path.join(LOG_DIR, file),
            stats: fs.statSync(path.join(LOG_DIR, file)),
        }))
        .sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);

    return files;
}

/**
 * 读取日志文件内容（支持 JSON 和 JSONL 格式）
 */
function readLogFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // JSONL 格式：返回第一行作为示例
        if (filePath.endsWith('.jsonl')) {
            const lines = content.trim().split('\n');
            if (lines.length > 0) {
                return JSON.parse(lines[0]);
            }
        }
        
        // JSON 格式
        return JSON.parse(content);
    } catch (error) {
        console.error(`读取文件失败 ${filePath}:`, error.message);
        return null;
    }
}

/**
 * 读取 JSONL 文件的所有条目
 */
function readJsonLFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.trim());
        return lines.map(line => JSON.parse(line));
    } catch (error) {
        console.error(`读取 JSONL 文件失败 ${filePath}:`, error.message);
        return [];
    }
}

/**
 * 显示日志摘要
 */
function showSummary(logData) {
    console.log('\n' + '='.repeat(80));
    console.log('时间戳:', logData.timestamp);
    console.log('API 来源:', logData.api_source);
    console.log('模型:', logData.model);
    console.log('-'.repeat(80));
    
    // 请求信息
    console.log('请求 URL:', logData.request?.url);
    console.log('请求方法:', logData.request?.method);
    
    // 统计 messages
    const messages = logData.request?.body?.messages || [];
    console.log('消息数量:', messages.length);
    
    // 其他参数
    const body = logData.request?.body || {};
    if (body.temperature) console.log('Temperature:', body.temperature);
    if (body.max_tokens) console.log('Max Tokens:', body.max_tokens);
    if (body.top_p) console.log('Top P:', body.top_p);
    
    console.log('-'.repeat(80));
    
    // 响应信息
    console.log('响应状态:', logData.response?.status, logData.response?.statusText);
    
    // Token 使用
    const usage = logData.response?.body?.usage;
    if (usage) {
        console.log('Token 使用:');
        console.log('  - Prompt:', usage.prompt_tokens);
        console.log('  - Completion:', usage.completion_tokens);
        console.log('  - Total:', usage.total_tokens);
    }
    
    // 响应内容预览
    const choices = logData.response?.body?.choices || [];
    if (choices.length > 0) {
        const content = choices[0]?.message?.content || '';
        const preview = content.substring(0, 200);
        console.log('\n响应预览:');
        console.log(preview + (content.length > 200 ? '...' : ''));
    }
    
    console.log('='.repeat(80) + '\n');
}

/**
 * 显示最新日志
 */
function showLatest() {
    const files = getLogFiles();
    
    if (files.length === 0) {
        console.log('没有找到日志文件');
        return;
    }

    const latestFile = files[0];
    console.log('最新日志文件:', latestFile.name);
    
    // 如果是 JSONL 格式，显示最后一条记录
    if (latestFile.name.endsWith('.jsonl')) {
        const entries = readJsonLFile(latestFile.path);
        if (entries.length > 0) {
            const lastEntry = entries[entries.length - 1];
            showSummary(lastEntry);
            console.log(`\n该文件共有 ${entries.length} 条日志记录\n`);
        }
    } else {
        const logData = readLogFile(latestFile.path);
        if (logData) {
            showSummary(logData);
        }
    }
}

/**
 * 显示最近 N 个日志的摘要
 */
function showRecent(count) {
    const files = getLogFiles().slice(0, count);
    
    if (files.length === 0) {
        console.log('没有找到日志文件');
        return;
    }

    console.log(`\n最近 ${files.length} 个日志文件:\n`);
    
    files.forEach((file, index) => {
        if (file.name.endsWith('.jsonl')) {
            // JSONL 格式：显示文件信息和第一条记录
            const entries = readJsonLFile(file.path);
            if (entries.length > 0) {
                const firstEntry = entries[0];
                const lastEntry = entries[entries.length - 1];
                console.log(`${index + 1}. ${file.name} (${entries.length} 条记录)`);
                console.log(`   时间范围: ${firstEntry.timestamp} ~ ${lastEntry.timestamp}`);
                console.log(`   API 来源: ${firstEntry.api_source} | 模型: ${firstEntry.model}`);
                console.log();
            }
        } else {
            // JSON 格式
            const logData = readLogFile(file.path);
            if (logData) {
                console.log(`${index + 1}. ${file.name}`);
                console.log(`   时间: ${logData.timestamp}`);
                console.log(`   API: ${logData.api_source} | 模型: ${logData.model}`);
                console.log(`   状态: ${logData.response?.status}`);
                console.log();
            }
        }
    });
}

/**
 * 搜索日志
 */
function searchLogs(keyword) {
    const files = getLogFiles();
    
    if (files.length === 0) {
        console.log('没有找到日志文件');
        return;
    }

    console.log(`\n搜索关键词: "${keyword}"\n`);
    
    let found = 0;
    files.forEach(file => {
        if (file.name.endsWith('.jsonl')) {
            // JSONL 格式：逐行搜索
            const entries = readJsonLFile(file.path);
            const matchedEntries = entries.filter(entry => {
                const content = JSON.stringify(entry).toLowerCase();
                return content.includes(keyword.toLowerCase());
            });
            
            if (matchedEntries.length > 0) {
                console.log(`✓ ${file.name} (${matchedEntries.length} 条匹配)`);
                matchedEntries.slice(0, 3).forEach(entry => {
                    console.log(`  时间: ${entry.timestamp}`);
                    console.log(`  API: ${entry.api_source} | 模型: ${entry.model}`);
                });
                if (matchedEntries.length > 3) {
                    console.log(`  ... 还有 ${matchedEntries.length - 3} 条`);
                }
                console.log();
                found += matchedEntries.length;
            }
        } else {
            // JSON 格式
            const logData = readLogFile(file.path);
            if (logData) {
                const content = JSON.stringify(logData).toLowerCase();
                if (content.includes(keyword.toLowerCase())) {
                    console.log(`✓ ${file.name}`);
                    console.log(`  时间: ${logData.timestamp}`);
                    console.log(`  API: ${logData.api_source} | 模型: ${logData.model}`);
                    console.log();
                    found++;
                }
            }
        }
    });

    if (found === 0) {
        console.log('未找到匹配的日志');
    } else {
        console.log(`共找到 ${found} 条匹配的日志记录`);
    }
}

/**
 * 显示帮助信息
 */
function showHelp() {
    console.log(`
API 日志查看工具

用法:
  node view-api-logs.js [选项]

选项:
  --latest          查看最新的日志文件详情
  --recent N        显示最近 N 个日志文件的摘要 (默认: 5)
  --search KEYWORD  搜索包含指定关键词的日志
  --list            列出所有日志文件
  --help            显示此帮助信息

示例:
  node view-api-logs.js --latest
  node view-api-logs.js --recent 10
  node view-api-logs.js --search "error"
  node view-api-logs.js --list
    `);
}

/**
 * 列出所有日志文件
 */
function listAll() {
    const files = getLogFiles();
    
    if (files.length === 0) {
        console.log('没有找到日志文件');
        return;
    }

    console.log(`\n所有日志文件 (共 ${files.length} 个):\n`);
    
    files.forEach((file, index) => {
        const sizeKB = (file.stats.size / 1024).toFixed(2);
        console.log(`${index + 1}. ${file.name} (${sizeKB} KB)`);
        console.log(`   修改时间: ${file.stats.mtime.toLocaleString()}`);
    });
    console.log();
}

// 主程序
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
} else if (args.includes('--latest')) {
    showLatest();
} else if (args.includes('--list')) {
    listAll();
} else if (args.includes('--recent')) {
    const countIndex = args.indexOf('--recent');
    const count = parseInt(args[countIndex + 1]) || 5;
    showRecent(count);
} else if (args.includes('--search')) {
    const searchIndex = args.indexOf('--search');
    const keyword = args[searchIndex + 1];
    if (keyword) {
        searchLogs(keyword);
    } else {
        console.log('请提供搜索关键词');
        showHelp();
    }
} else {
    console.log('未知选项:', args.join(' '));
    showHelp();
}
