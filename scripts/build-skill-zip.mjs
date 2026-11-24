#!/usr/bin/env node
// 把 skill/halloCD/ 打成 public/halloCD-agent-skill.zip
//
// ------------------------------------------------------------------
// 为什么不用 Compress-Archive：
//   PowerShell 5.1 的 Compress-Archive 把条目名写成 **反斜杠**
//   （halloCD\SKILL.md）。Windows 上解得开，macOS / Linux 上会解成
//   一个名为 "halloCD\SKILL.md" 的单文件 —— 技能目录直接废掉。
//   用户的 agent 大概率跑在 macOS 或 Linux 上，所以这里必须自己打包。
//
// 为什么时间戳固定：
//   同样的输入产出同样的字节 —— 技能包进了版本库之后，
//   每次重新打包都产生一个巨大的二进制 diff，没法 review。
//
// 用法：npm run build:skill-zip

import { deflateRawSync } from "node:zlib";
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SRC_DIR = join(ROOT, "skill", "halloCD");
const OUT = join(ROOT, "public", "halloCD-agent-skill.zip");

/* ---- CRC32（zip 格式要求）---- */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/* ---- 固定时间戳：2024-01-01 00:00:00（DOS 时间）---- */
const DOS_TIME = 0; // 00:00:00
const DOS_DATE = ((2024 - 1980) << 9) | (1 << 5) | 1; // 2024-01-01

/* ---- 递归收集文件（目录条目也写进去，解压后目录自动存在）----
   prefix = 顶层目录名 —— 技能包解出来应该是 halloCD/SKILL.md，
   用户直接把 halloCD/ 整个丢进 skills 目录就对了。 */
function collect(dir, base = "", prefix = "") {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const st = statSync(full);
    const rel = base ? `${base}/${name}` : name;
    const relWithPrefix = prefix ? `${prefix}/${rel}` : rel;
    if (st.isDirectory()) {
      out.push({ name: `${relWithPrefix}/`, dir: true });
      out.push(...collect(full, rel, prefix));
    } else {
      out.push({ name: relWithPrefix, dir: false, data: readFileSync(full) });
    }
  }
  return out;
}

function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const data = entry.dir ? Buffer.alloc(0) : entry.data;
    const raw = entry.dir ? Buffer.alloc(0) : data;
    const compressed = entry.dir ? Buffer.alloc(0) : deflateRawSync(data, { level: 9 });
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // flag: UTF-8 name
    local.writeUInt16LE(entry.dir ? 0 : 8, 8); // method: 0=store 8=deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra len

    locals.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(entry.dir ? 0 : 8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(entry.dir ? 0x41ed0010 : 0x81a40000, 38); // external attrs
    central.writeUInt32LE(offset, 42);

    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuf, end]);
}

const entries = collect(SRC_DIR, "", "halloCD");
const zip = buildZip(entries);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, zip);

console.log(`wrote ${relative(ROOT, OUT)}`);
console.log(`  ${entries.length} entries, ${zip.length} bytes`);
for (const e of entries) {
  console.log(`  ${e.name}${e.dir ? "/" : ` (${e.data.length} B)`}`);
}

/* 顺手核对：条目名里不能有反斜杠 —— 那正是 Compress-Archive 的毛病 */
/* 顺手核对：条目名里不能有反斜杠 —— 那正是 Compress-Archive 的毛病。
   zip 条目名一律用「/」分隔（这是 zip 规范，Windows 上打包也必须用「/」），
   所以这里只查反斜杠。

   踩过的坑：早先这里还多判了一个 `e.name.includes(sep)`，
   而 POSIX（Linux / macOS）上 sep 恰好就是「/」——
   于是这个自检在任何 POSIX 机器上都会误判，脚本直接 exit 1。
   本地是 Windows（sep 是反斜杠）所以一直没暴露，
   一放到 Vercel 的 Linux 构建机上就构建失败。 */
const bad = entries.filter((e) => e.name.includes("\\"));
if (bad.length) {
  console.error("FAIL: 条目名里有反斜杠");
  process.exit(1);
}
