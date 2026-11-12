'use strict';
/**
 * 开源前安全体检 —— 扫出不该进公开仓库的东西。
 *
 * 只报「文件 + 行号 + 类型 + 打码预览」，绝不打印密钥原文。
 * 用法: node scripts/audit-open-source.js [projectRoot]
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.vercel', 'out', 'coverage']);
const SKIP_FILES = new Set(['package-lock.json', 'tsconfig.tsbuildinfo']);

/* ---------- 规则：每条给出一个类型名 + 判定 + 脱敏函数 ---------- */
const RULES = [
  {
    id: 'db-url',
    type: '数据库连接串',
    re: /(postgres(?:ql)?:\/\/[^\s"'`)]+)/gi,
    mask: (m) => m.replace(/:[^:@/]+@/, ':***@').replace(/\/\/[^@]+@/, '//***@'),
  },
  {
    id: 'neon-host',
    type: 'Neon 主机名',
    re: /\b[a-z0-9-]+\.(?:neon\.tech|neon\.build)\b/gi,
    mask: (m) => m,
  },
  {
    id: 'vercel-token',
    type: 'Vercel token',
    re: /\b[a-zA-Z0-9]{24}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\b/g,
    mask: () => '***',
  },
  {
    id: 'github-pat',
    type: 'GitHub token',
    re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
    mask: () => '***',
  },
  {
    id: 'stripe',
    type: 'Stripe 密钥',
    re: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
    mask: () => '***',
  },
  {
    id: 'openai-ish',
    type: 'LLM API 密钥',
    re: /\bsk-[A-Za-z0-9]{20,}\b/g,
    mask: () => '***',
  },
  {
    id: 'private-key',
    type: '私钥块',
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
    mask: () => '-----BEGIN PRIVATE KEY-----',
  },
  {
    id: 'bearer-literal',
    type: '代码里的 Authorization 字面量',
    re: /["'`]Authorization["'`]\s*[:,]\s*["'`][^"'`]{12,}["'`]/gi,
    mask: (m) => m.replace(/[^"']{12,}(["'`]$)/, '***$1'),
  },
];

/* ---------- 整体不该进仓库的路径 ---------- */
const BANNED_PATHS = [
  { p: /^data\//, why: '运行时数据：用户 / 订单 / 会话 / API key 哈希' },
  // .env.example 是**模板**，本来就该进仓库 —— 只排除真环境变量文件
  { p: /^\.env$|^\.env\.(?!example$)/, why: '环境变量：真实凭据（.env.example 是模板，不算）' },
  { p: /^\.vercel\//, why: 'Vercel 项目绑定信息' },
  { p: /^public\//, why: '素材不可再分发（仓库里只留 scripts/asset-manifest.json 规格清单）' },
  { p: /^docs\//, why: '内部产品与后端文档，不公开' },
  { p: /pgdata\//, why: '本地 Postgres 数据目录（含真实数据与 WAL）' },
  { p: /sql-log\.txt$/, why: 'SQL 日志：含查询参数与业务数据' },
  { p: /server\.(key|crt|pem)$/, why: 'TLS 私钥 / 证书' },
  { p: /\.tsbuildinfo$/, why: '构建缓存' },
];

/* ---------- 文件级抽查（PII 计数，不打印内容） ---------- */
function piiStats(file) {
  const t = fs.readFileSync(file, 'utf8');
  const emails = (t.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []).length;
  const hashes = (t.match(/scrypt\$/g) || []).length;
  const tracks = (t.match(/TRACK-\d+/g) || []).length;
  const phones = (t.match(/\b\d{3}-\d{3}-\d{4}\b/g) || []).length;
  const addr = (t.match(/"(?:address|street|city|zip|postal)[A-Za-z]*"\s*:\s*"[^"]{4,}"/gi) || []).length;
  return { emails, hashes, tracks, phones, addr };
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, out);
    } else if (e.isFile()) {
      if (SKIP_FILES.has(e.name)) continue;
      out.push(rel);
    }
  }
  return out;
}

const files = walk(ROOT, []);
console.log(`扫描根目录: ${ROOT}`);
console.log(`候选文件数: ${files.length}\n`);

/* ---------- 1. 整路径级禁令 ---------- */
console.log('=========== 1. 整路径级：这些目录/文件不该进仓库 ===========');
const bannedFound = [];
for (const f of files) {
  for (const b of BANNED_PATHS) {
    if (b.p.test(f)) {
      bannedFound.push({ f, why: b.why });
      break;
    }
  }
}
if (!bannedFound.length) console.log('（无）');
else {
  const byWhy = new Map();
  for (const x of bannedFound) {
    if (!byWhy.has(x.why)) byWhy.set(x.why, []);
    byWhy.get(x.why).push(x.f);
  }
  for (const [why, list] of byWhy) {
    console.log(`\n  ✗ ${why}  —— ${list.length} 个`);
    for (const f of list.slice(0, 6)) console.log(`      ${f}`);
    if (list.length > 6) console.log(`      ... 另有 ${list.length - 6} 个`);
  }
}

/* ---------- 2. 内容级密钥扫描 ---------- */
console.log('\n=========== 2. 内容级：源码里硬编码的凭据 ===========');
let hits = 0;
for (const rel of files) {
  const abs = path.join(ROOT, rel);
  let text;
  try {
    const st = fs.statSync(abs);
    if (st.size > 4 * 1024 * 1024) continue;
    text = fs.readFileSync(abs, 'utf8');
  } catch {
    continue;
  }
  if (text.includes('\u0000')) continue;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const r of RULES) {
      r.re.lastIndex = 0;
      const m = r.re.exec(lines[i]);
      if (!m) continue;
      const masked = r.mask(m[0]);
      const shown = masked.length > 78 ? masked.slice(0, 78) + '…' : masked;
      console.log(`  ${rel}:${i + 1}  [${r.type}]  ${shown}`);
      hits++;
    }
  }
}
if (!hits) console.log('（无硬编码凭据）');
else console.log(`\n  共 ${hits} 处。`);

/* ---------- 3. 环境变量文件 ---------- */
console.log('\n=========== 3. 环境变量文件 ===========');
const envs = files.filter((f) => /(^|\/)\.env/.test(f));
if (!envs.length) console.log('（无）');
for (const f of envs) {
  const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const keys = t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => l.slice(0, l.indexOf('=')).trim());
  const filled = keys.filter((k) => {
    const line = t.split(/\r?\n/).find((l) => l.trim().startsWith(k + '='));
    return line && line.slice(line.indexOf('=') + 1).trim().length > 0;
  });
  console.log(`  ${f}  —— ${keys.length} 个键，其中 ${filled.length} 个有值`);
  for (const k of keys) console.log(`      ${k}`);
}

/* ---------- 4. 运行时数据里的 PII 计数 ---------- */
console.log('\n=========== 4. 运行时数据里的敏感信息计数 ===========');
const piiFiles = files.filter((f) => /^data\//.test(f) || /pgdata/.test(f) || /sql-log/.test(f));
if (!piiFiles.length) console.log('（无）');
for (const f of piiFiles.slice(0, 12)) {
  try {
    const s = piiStats(path.join(ROOT, f));
    const bits = [];
    if (s.emails) bits.push(`邮箱 ${s.emails}`);
    if (s.hashes) bits.push(`口令哈希 ${s.hashes}`);
    if (s.tracks) bits.push(`运单号 ${s.tracks}`);
    if (s.addr) bits.push(`地址字段 ${s.addr}`);
    if (bits.length) console.log(`  ${f}  —— ${bits.join(' · ')}`);
  } catch {}
}

/* ---------- 5. 开源可用性体检 ---------- */
console.log('\n=========== 5. 开源可用性 ===========');
const gi = path.join(ROOT, '.gitignore');
console.log(`  .gitignore 存在: ${fs.existsSync(gi)}`);
if (fs.existsSync(gi)) {
  const g = fs.readFileSync(gi, 'utf8');
  const need = [
    ['/data', '运行时数据'],
    ['.env*', '环境变量'],
    ['pgdata', 'Postgres 数据目录'],
    ['sql-log', 'SQL 日志'],
    ['*.key', '私钥'],
  ];
  for (const [pat, why] of need) {
    const ok = g.split(/\r?\n/).some((l) => l.trim().replace(/^\//, '').includes(pat.replace(/^\//, '')));
    console.log(`    ${ok ? '✓' : '✗'} 已忽略 ${pat}  (${why})`);
  }
}
const lic = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].find((n) => fs.existsSync(path.join(ROOT, n)));
console.log(`  LICENSE 文件: ${lic || '缺失（开源必须补）'}`);
const rd = ['README.md', 'README.mdx'].find((n) => fs.existsSync(path.join(ROOT, n)));
console.log(`  README 文件: ${rd || '缺失'}`);
