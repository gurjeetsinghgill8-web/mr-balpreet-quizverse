/**
 * QUIZVERSE — DOCUMENT INGEST
 * ===========================================================================
 * Turns an uploaded teacher document into clean plain text for question
 * generation. Dependency-free, and identical in the browser (File / Blob /
 * ArrayBuffer) and in Node 18+ (Buffer / ArrayBuffer).
 *
 *   .pdf  → real text-layer extraction (FlateDecode streams + ToUnicode CMaps)
 *   .docx → hand-written ZIP reader + word/document.xml (WordprocessingML)
 *   .txt .text .md .markdown .csv .tsv → UTF-8 text
 *
 * Routing is by file extension first, then by magic bytes ("%PDF-", "PK\x03\x04").
 * ingestFile() / ingestBuffer() NEVER throw: a failure comes back as
 * { ok: false, error, message, warnings } with a teacher-facing message.
 */
const MAX_TEXT_CHARS = 200000; // text is silently cut here (see normaliseText)
export const MIN_QUALITY = 0.35; // lowest text confidence we accept (see estimateQuality)
const MAX_FILE_BYTES = 12 * 1024 * 1024;

/* ---- SECTION 0 — constants and teacher-facing messages -------------- */
const KIND_BY_EXTENSION = {
  pdf: 'pdf', docx: 'docx', txt: 'text', text: 'text', md: 'text', markdown: 'text', csv: 'text', tsv: 'text',
};
const MESSAGES = {
  unsupported_type: 'This file type is not supported yet. Please upload a PDF, a Word (.docx) file, or a text / '
    + 'Markdown / CSV file — or simply paste the text into the box.',
  unreadable: 'Unable to read this document. Please try another PDF or paste the text.',
  no_text_layer: 'We could not find readable words in this file — it looks like a scan or a picture of pages. '
    + 'Please paste the text, or upload a text-based document instead.',
  encrypted: 'This PDF is password-protected, so we cannot open it. Please remove the password (or save a fresh '
    + 'copy) and try again, or paste the text instead.',
  empty: 'No lesson text was found in this file. Please check the file, or paste the text into the box.',
  too_large: 'This file is too large to read here. Please upload a smaller file or paste the text instead.',
};
const KNOWN_ERRORS = new Set(['unsupported_type', 'unreadable', 'no_text_layer', 'encrypted', 'empty', 'too_large']);

// The single shape every failure is reported through.
function failure(error, warnings = []) {
  const code = KNOWN_ERRORS.has(error) ? error : 'unreadable';
  return { ok: false, error: code, message: MESSAGES[code], warnings: [...warnings] };
}

/* ---- SECTION 1 — tiny byte helpers (no Buffer / no TextDecoder) ------ */
// Normalise any accepted byte input to a Uint8Array view (throws only here).
function toUint8(input) {
  if (input instanceof Uint8Array) return input;
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (Object.prototype.toString.call(input) === '[object ArrayBuffer]') return new Uint8Array(input);
  throw new TypeError('unsupported byte input');
}
// Latin-1 view of a byte range: every char code equals one byte value.
function latin1(bytes, start = 0, end = bytes.length) {
  let out = '';
  for (let i = start; i < end; i += 8192) {
    const stop = Math.min(i + 8192, end);
    for (let j = i; j < stop; j++) out += String.fromCharCode(bytes[j]);
  }
  return out;
}
// ASCII bytes of a short literal such as "%PDF-" or "endstream".
function asciiBytes(text) {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}
// Raw byte search — the byte stream is mostly binary, so no strings here.
function indexOfBytes(haystack, needle, from = 0) {
  outer: for (let i = Math.max(0, from), limit = haystack.length - needle.length; i <= limit; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}
// Best-effort UTF-8 (BOM-aware) decoding with a Latin-1 fallback.
function decodeUtf8(bytes) {
  if (typeof TextDecoder === 'function') {
    try { return new TextDecoder('utf-8', { fatal: false }).decode(bytes); } catch { /* manual path */ }
  }
  return latin1(bytes);
}

/* ---- SECTION 2 — inflate (PDF FlateDecode / ZIP method 8) ------------ */
/*
 * Inflate a zlib-wrapped or raw deflate buffer: DecompressionStream first
 * ('deflate' = zlib wrapper, then 'deflate-raw'), node:zlib only when that is
 * unavailable. Returns null for data that is not deflate data — callers read
 * null as "skip this stream" / "unreadable file", never as an exception.
 */
async function inflateBytes(data) {
  if (!data || data.length === 0) return null;
  const DS = globalThis.DecompressionStream;
  if (typeof DS === 'function' && typeof globalThis.Blob === 'function' && typeof globalThis.Response === 'function') {
    for (const format of ['deflate', 'deflate-raw']) {
      try {
        const stream = new Blob([data]).stream().pipeThrough(new DS(format));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      } catch { /* wrong container (zlib vs raw): try the next format */ }
    }
  }
  try {
    const zlib = await import('node:zlib');
    try { return new Uint8Array(zlib.inflateSync(data)); } catch { /* not zlib-wrapped */ }
    try { return new Uint8Array(zlib.inflateRawSync(data)); } catch { /* not raw deflate */ }
  } catch { /* node:zlib unavailable (browser) — nothing else to try */ }
  return null;
}

/* ---- SECTION 3 — text normalisation and quality ---------------------- */
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g;

/**
 * Collapse a raw string into clean, generator-ready plain text: \r\n → \n, tabs
 * and non-breaking spaces → spaces, control characters removed, runs of
 * horizontal space → one space, every line trimmed, three or more newlines → a
 * single blank line, then trimmed and capped at MAX_TEXT_CHARS. The cap is
 * deliberately silent (no warning is attached): a document longer than 200 000
 * characters still holds far more material than a quiz needs, so we keep the
 * head of it and tell the teacher nothing.
 *
 * @param {string} raw
 * @param {{ maxCharacters?: number }} [options] optional lower cap
 * @returns {string}
 */
export function normaliseText(raw, options = {}) {
  const limit = Number.isFinite(options.maxCharacters) && options.maxCharacters > 0
    ? Math.min(options.maxCharacters, MAX_TEXT_CHARS) : MAX_TEXT_CHARS;
  const text = String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\u00A0\u2007\u202F]/g, ' ')
    .replace(CONTROL_RE, '')
    .replace(/[ \f\v]+/g, ' ')
    .split('\n').map((line) => line.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > limit ? text.slice(0, limit).trim() : text;
}

// Character classification, cached per character so long documents stay fast.
const CHAR_CLASS_CACHE = new Map();
const RE_LETTER = /\p{L}/u, RE_NUMBER = /\p{N}/u, RE_SYMBOL = /\p{S}/u, RE_SPACE = /\s/;
const RE_CONTROL_CHAR = /[\p{Cc}\p{Cf}\p{Co}\p{Cs}]/u;
const CLASS_SPACE = 1, CLASS_CONTROL = 2, CLASS_LETTER = 4, CLASS_NUMBER = 8, CLASS_SYMBOL = 16;
const WORD_EDGE_RE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const WORD_CORE_RE = /^[\p{L}\p{N}][\p{L}\p{N}'’-]*$/u;

function classifyChar(ch) {
  let flags = CHAR_CLASS_CACHE.get(ch);
  if (flags === undefined) {
    flags = 0;
    if (RE_SPACE.test(ch)) flags |= CLASS_SPACE;
    else if (RE_CONTROL_CHAR.test(ch)) flags |= CLASS_CONTROL;
    if (RE_LETTER.test(ch)) flags |= CLASS_LETTER;
    else if (RE_NUMBER.test(ch)) flags |= CLASS_NUMBER;
    else if (RE_SYMBOL.test(ch)) flags |= CLASS_SYMBOL;
    CHAR_CLASS_CACHE.set(ch, flags);
  }
  return flags;
}

/**
 * Confidence (0..1) that a string is usable lesson content. Heuristic, not proof.
 * Signals: share of letters/digits/spaces; share of letters among non-space
 * characters; share of words that look like real words (2..18 characters once
 * surrounding punctuation is trimmed); terminal punctuation density (. ! ? ।);
 * and a sane average word length. Penalties: control / format characters (binary
 * noise); symbol-heavy text (random bytes decode to walls of §±¤®©); runs of one
 * repeated character; a table-of-contents shape (dot leaders, or lines ending in
 * a page number); and long text with no full stop anywhere.
 *
 * @param {string} text
 * @returns {number} 0..1
 */
export function estimateQuality(text) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (trimmed.length === 0) return 0;
  if (trimmed.length < 20) return 0.1; // too short to judge fairly

  let chars = 0, spaces = 0, letters = 0, numbers = 0, symbols = 0, controls = 0;
  let longestRun = 0, currentRun = 0, previous = '';
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    const flags = classifyChar(ch);
    chars++;
    if (flags & CLASS_SPACE) spaces++;
    if (flags & CLASS_CONTROL) controls++;
    if (flags & CLASS_LETTER) letters++;
    else if (flags & CLASS_NUMBER) numbers++;
    else if (flags & CLASS_SYMBOL) symbols++;
    currentRun = ch === previous ? currentRun + 1 : 1;
    previous = ch;
    if (currentRun > longestRun) longestRun = currentRun;
  }

  const nonSpace = Math.max(1, chars - spaces);
  const words = trimmed.split(/\s+/).filter(Boolean);
  let plausibleWords = 0, totalWordLength = 0;
  for (const raw of words) {
    const core = raw.replace(WORD_EDGE_RE, '');
    totalWordLength += core.length;
    if (core.length >= 2 && core.length <= 18 && WORD_CORE_RE.test(core)) plausibleWords++;
  }
  const averageWordLength = words.length ? totalWordLength / words.length : 0;
  const terminalCount = (trimmed.match(/[.!?।]/g) || []).length;
  const sentenceScore = words.length ? Math.min(1, (terminalCount / words.length) * 25) : 0;
  let wordCountScore = 0;
  if (words.length >= 5 && averageWordLength >= 3 && averageWordLength <= 10) wordCountScore = 1;
  else if (words.length >= 3 && averageWordLength >= 2 && averageWordLength <= 14) wordCountScore = 0.5;

  let score = 0.30 * Math.min(1, (letters + numbers + spaces) / chars) // core characters
    + 0.15 * Math.min(1, letters / nonSpace) // letters among the non-space characters
    + 0.25 * (words.length ? plausibleWords / words.length : 0) // believable word shapes
    + 0.15 * sentenceScore
    + 0.15 * wordCountScore;
  score -= 0.50 * Math.min(1, (controls / chars) * 4); // binary noise
  score -= 0.35 * Math.min(1, Math.max(0, symbols / nonSpace - 0.03) * 8); // symbol wall
  if (longestRun >= 40) score -= 0.6; else if (longestRun >= 12) score -= 0.35; // "aaaa…"
  if (words.length >= 10) { // table-of-contents shape
    const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean);
    const tocLines = lines.filter((line) => /\.{3,}|\s\d+\s*$/.test(line)).length;
    if (lines.length >= 3 && tocLines / lines.length > 0.3) score -= 0.15;
  }
  if (chars >= 150 && terminalCount === 0) score -= 0.2; // word salad, not a lesson
  return Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));
}

/* ---- SECTION 4 — PDF: streams, ToUnicode CMaps, content operators ---- */
/*
 * A PDF stream object looks like:
 *     << /Filter /FlateDecode /Length N >>  stream<CR|LF> …bytes… endstream
 * We never build the cross-reference table: scanning the raw bytes for the
 * "stream" / "endstream" keywords is enough to find page content and font maps
 * in the PDFs a teacher uploads, and it survives slightly damaged files too.
 */
const STREAM_KEYWORD = asciiBytes('stream');
const ENDSTREAM_KEYWORD = asciiBytes('endstream');
const END_KEYWORD = asciiBytes('end');
const DICT_LOOKBACK = 800; // /Filter sits a few bytes before "stream"
const CMAP_HINT_RE = /beginbfchar|beginbfrange|begincmap/;
const PDF_DELIMS = new Set(['(', ')', '<', '>', '[', ']', '{', '}', '/', '%']);

function isPdfSpace(ch) {
  return ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t' || ch === '\f' || ch === '\u0000';
}

/*
 * Locate every `stream … endstream` payload. The dictionary is taken from the
 * bytes between the previous stream and this keyword, so a previous object's
 * /FlateDecode can never leak onto this one.
 */
function findPdfStreams(bytes) {
  const streams = [];
  let from = 0, previousEnd = 0;
  for (;;) {
    const at = indexOfBytes(bytes, STREAM_KEYWORD, from);
    if (at < 0) break;
    if (at >= 3 && indexOfBytes(bytes, END_KEYWORD, at - 3) === at - 3) { // "endstream"
      from = at + STREAM_KEYWORD.length; // the keyword itself, not a payload
      continue;
    }
    let dataStart = at + STREAM_KEYWORD.length;
    if (bytes[dataStart] === 0x0d) dataStart++; // CR
    if (bytes[dataStart] === 0x0a) dataStart++; // LF
    let end = indexOfBytes(bytes, ENDSTREAM_KEYWORD, dataStart);
    if (end < 0) end = bytes.length; // truncated file: take what we have
    let dataEnd = end;
    while (dataEnd > dataStart && (bytes[dataEnd - 1] === 0x0a || bytes[dataEnd - 1] === 0x0d)) dataEnd--;
    streams.push({
      data: bytes.subarray(dataStart, dataEnd),
      dict: latin1(bytes, Math.max(previousEnd, at - DICT_LOOKBACK, 0), at),
    });
    previousEnd = Math.min(bytes.length, end + ENDSTREAM_KEYWORD.length);
    from = previousEnd;
  }
  return streams;
}

// <0041> / <D83DDE00> → real characters (the values are UTF-16BE code units).
function hexToUnicode(hex) {
  const padded = hex.length % 4 === 0 ? hex : hex.padStart(Math.ceil(hex.length / 4) * 4, '0');
  let out = '';
  for (let i = 0; i + 4 <= padded.length; i += 4) out += String.fromCharCode(parseInt(padded.slice(i, i + 4), 16));
  return out;
}
// Safe code point → string (empty for nonsense code points).
function codePointToString(code) {
  try { return code <= 0xffff ? String.fromCharCode(code) : String.fromCodePoint(code); } catch { return ''; }
}

/*
 * Merge `beginbfchar … endbfchar` and `beginbfrange … endbfrange` sections into
 * one code → character map. A range may end in a start code (<lo> <hi> <start>,
 * incremented once per code) or in an array of targets.
 *
 * LIMITATION: mappings from every font in the document land in a single map, so
 * a textbook that mixes fonts (say Latin + Devanagari) can map one byte code to
 * two different characters and the last one wins. Per-font maps would need the
 * page resource dictionaries, which this lightweight reader deliberately skips.
 */
function parseCMapText(text, map) {
  for (const block of text.match(/beginbfchar[\s\S]*?endbfchar/g) || []) {
    for (const pair of block.match(/<[0-9a-fA-F]+>\s*<[0-9a-fA-F]*>/g) || []) {
      const parts = pair.match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/);
      if (parts) map.set(parseInt(parts[1], 16), hexToUnicode(parts[2]));
    }
  }
  for (const block of text.match(/beginbfrange[\s\S]*?endbfrange/g) || []) {
    const triples = block.match(/<[0-9a-fA-F]+>\s*<[0-9a-fA-F]+>\s*(?:<[0-9a-fA-F]+>|\[[^\]]*\])/g) || [];
    for (const triple of triples) {
      const parts = triple.match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]+>|\[[^\]]*\])/);
      if (!parts) continue;
      const low = parseInt(parts[1], 16), high = parseInt(parts[2], 16);
      if (!Number.isFinite(low) || !Number.isFinite(high) || high < low) continue;
      const span = Math.min(high - low, 65535);
      if (parts[3].charAt(0) === '[') {
        (parts[3].match(/<([0-9a-fA-F]*)>/g) || []).forEach((item, index) => {
          if (index <= span) map.set(low + index, hexToUnicode(item.slice(1, -1)));
        });
      } else {
        const startCode = parseInt(parts[3].slice(1, -1), 16);
        if (Number.isFinite(startCode)) {
          for (let step = 0; step <= span; step++) map.set(low + step, codePointToString(startCode + step));
        }
      }
    }
  }
  return map;
}

// Windows-1252 for 0x80–0x9F, which Latin-1 leaves undefined (index 0 = byte 0x80).
const CP1252_HIGH = '\u20AC\u0081\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u008D'
  + '\u017D\u008F\u0090\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u009D\u017E\u0178';
function winAnsiChar(code) {
  if (code >= 0x80 && code <= 0x9f) return CP1252_HIGH.charAt(code - 0x80) || String.fromCharCode(code);
  return String.fromCharCode(code);
}

/*
 * Byte-string → characters decoder. With a usable CMap it decodes 2-byte codes
 * when any mapped code exceeds 0xFF (the usual signal for an identity-style
 * subset CMap) and 1-byte codes otherwise; with no CMap, or for codes the map
 * does not list, it decodes Latin-1 / WinAnsi and counts the fallbacks so the
 * caller can warn the teacher.
 */
function createTextDecoder(cmap) {
  const hasMap = cmap instanceof Map && cmap.size > 0;
  let twoByte = false;
  if (hasMap) for (const code of cmap.keys()) if (code > 0xff) { twoByte = true; break; }
  const stats = { unmapped: 0 };
  const fallback = (byteString, from, count) => {
    let plain = '';
    for (let i = from; i < from + count && i < byteString.length; i++) plain += winAnsiChar(byteString.charCodeAt(i));
    return plain;
  };
  const decode = (byteString) => {
    if (!hasMap) return fallback(byteString, 0, byteString.length);
    let out = '';
    const step = twoByte ? 2 : 1;
    for (let i = 0; i < byteString.length; i += step) {
      const code = twoByte && i + 1 < byteString.length
        ? (byteString.charCodeAt(i) << 8) | byteString.charCodeAt(i + 1) : byteString.charCodeAt(i);
      const mapped = cmap.get(code);
      if (mapped === undefined) { stats.unmapped++; out += fallback(byteString, i, step); } else out += mapped;
    }
    return out;
  };
  return { decode, stats, hasMap, twoByte };
}

// PDF string escapes: \n \r \t \b \f \( \) \\  (octal codes and continuations below).
const PDF_ESCAPES = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };

/*
 * Read a parenthesised PDF string starting at src[start] === '('. Handles the
 * escapes above, a backslash-newline line continuation and \ddd octal codes.
 * Returns a byte string (one char code = one byte).
 */
function readLiteralString(src, start) {
  let i = start + 1, depth = 1, out = '';
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') {
      const next = src[i + 1];
      i += 2;
      if (next === undefined) break;
      else if (Object.prototype.hasOwnProperty.call(PDF_ESCAPES, next)) out += PDF_ESCAPES[next];
      else if (next === '\n') { /* line continuation */ }
      else if (next === '\r') { if (src[i] === '\n') i++; } // line continuation
      else if (next >= '0' && next <= '7') {
        let octal = next;
        while (octal.length < 3 && src[i] >= '0' && src[i] <= '7') { octal += src[i]; i++; }
        out += String.fromCharCode(parseInt(octal, 8) & 0xff);
      } else out += next;
      continue;
    }
    if (ch === '(') { depth++; out += ch; i++; continue; } // nested parentheses
    if (ch === ')') { depth--; i++; if (depth === 0) break; out += ch; continue; }
    out += ch;
    i++;
  }
  return { value: out, next: i };
}

// Read a <hex string> starting at src[start] === '<' (never a << dictionary).
function readHexString(src, start) {
  let i = start + 1, hex = '';
  while (i < src.length && src[i] !== '>') {
    if (/[0-9a-fA-F]/.test(src[i])) hex += src[i];
    i++;
  }
  i++; // consume '>'
  if (hex.length % 2 === 1) hex += '0';
  let out = '';
  for (let k = 0; k + 2 <= hex.length; k += 2) out += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16));
  return { value: out, next: i };
}

// Skip a balanced << … >> dictionary inside a content stream.
function skipBalancedDict(src, start) {
  let i = start + 2, depth = 1;
  while (i < src.length && depth > 0) {
    if (src[i] === '<' && src[i + 1] === '<') { depth++; i += 2; }
    else if (src[i] === '>' && src[i + 1] === '>') { depth--; i += 2; }
    else i++;
  }
  return i;
}

// Tokenise a content stream into { t: 'string' | 'array' | 'word', v } tokens.
function tokenizeContentStream(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '%') { // comment: skip to the end of the line
      while (i < src.length && src[i] !== '\n' && src[i] !== '\r') i++;
    } else if (ch === '(' || ch === '<') {
      if (ch === '<' && src[i + 1] === '<') { i = skipBalancedDict(src, i); continue; }
      const read = ch === '(' ? readLiteralString(src, i) : readHexString(src, i);
      tokens.push({ t: 'string', v: read.value });
      i = read.next;
    } else if (ch === '[') { // show-array: only the strings inside it matter
      i++;
      const items = [];
      while (i < src.length && src[i] !== ']') {
        if (src[i] === '(') { const read = readLiteralString(src, i); items.push(read.value); i = read.next; }
        else if (src[i] === '<') { const read = readHexString(src, i); items.push(read.value); i = read.next; }
        else i++;
      }
      i++;
      tokens.push({ t: 'array', v: items });
    } else if (isPdfSpace(ch) || PDF_DELIMS.has(ch)) {
      i++;
    } else {
      let j = i;
      while (j < src.length && !isPdfSpace(src[j]) && !PDF_DELIMS.has(src[j])) j++;
      tokens.push({ t: 'word', v: src.slice(i, j) }); // operator, number or name
      i = j;
    }
  }
  return tokens;
}

// Last operand of the given kind (operands are pushed before the operator).
function lastOperand(stack, type) {
  for (let k = stack.length - 1; k >= 0; k--) if (stack[k].t === type) return stack[k].v;
  return null;
}

/*
 * Render the text-drawing operators: (string) Tj, (string) ', (aw ac string) ",
 * [(a) -250 (b)] TJ (a space goes between the chunks), and ET — where we emit a
 * newline so words from two text objects never glue together.
 */
function renderContentTokens(tokens, decode) {
  let out = '', ops = 0;
  const stack = [];
  for (const token of tokens) {
    if (token.t !== 'word') { // operand
      stack.push(token);
      if (stack.length > 64) stack.shift();
      continue;
    }
    if (token.v === 'ET') { out += '\n'; continue; }
    if (token.v === 'Tj' || token.v === "'" || token.v === '"') {
      if (token.v !== 'Tj') out += '\n'; // the quote operators move to a new line first
      const raw = lastOperand(stack, 'string');
      if (raw !== null) { out += decode(raw); ops++; }
      continue;
    }
    if (token.v === 'TJ') {
      const items = lastOperand(stack, 'array');
      if (items && items.length) {
        const parts = items.map(decode).filter((part) => part.length > 0);
        if (parts.length) { out += parts.join(' '); ops++; }
      }
      continue;
    }
    stack.length = 0; // any other operator consumes its operands and draws no text
  }
  return { text: out, ops };
}

// Count "/Type /Page" objects (best effort; "/Type /Pages" is excluded).
function countPdfPages(raw) {
  const matches = raw.match(/\/Type\s*\/Page(?![A-Za-z0-9])/g);
  return matches && matches.length ? matches.length : null;
}
// A throwable failure carrying the public error code.
function ingestError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Extract the text layer of a PDF. ASYNC (stream inflation is async).
 * Verify the header → detect /Encrypt → collect streams → inflate FlateDecode
 * streams (a failed inflation is skipped, never fatal) → harvest ToUnicode maps
 * → render the content streams → normalise.
 *
 * @param {Uint8Array|ArrayBuffer|Buffer} bytesInput
 * @param {object} [options] reserved for future use
 * @returns {Promise<{ text: string, pages: number|null, method: 'text-layer', warnings: string[], bytesScanned: number }>}
 * @throws {Error} .code 'unreadable' | 'encrypted' | 'no_text_layer'
 */
export async function extractPdfText(bytesInput, options = {}) {
  void options;
  const bytes = toUint8(bytesInput);
  const warnings = [];
  const bytesScanned = bytes.length;
  if (bytes.length < 5 || latin1(bytes, 0, 5) !== '%PDF-') throw ingestError('unreadable', MESSAGES.unreadable);

  const raw = latin1(bytes);
  if (/\/Encrypt\b/.test(raw)) throw ingestError('encrypted', MESSAGES.encrypted);

  const streams = findPdfStreams(bytes);
  const cmap = new Map();
  const contentStreams = [];
  for (const stream of streams) {
    let data = stream.data;
    if (/\/FlateDecode/.test(stream.dict)) {
      const inflated = await inflateBytes(data);
      if (!inflated) continue; // broken or unsupported filter: skip, never fatal
      data = inflated;
    }
    const text = latin1(data);
    if (CMAP_HINT_RE.test(text)) parseCMapText(text, cmap); // font maps span the whole file
    else contentStreams.push(text);
  }

  const decoder = createTextDecoder(cmap);
  let rendered = '', textOps = 0;
  for (const content of contentStreams) {
    const tokens = tokenizeContentStream(content);
    if (!tokens.length) continue;
    const page = renderContentTokens(tokens, decoder.decode);
    textOps += page.ops;
    if (page.text) rendered += `${page.text}\n`;
  }
  const text = normaliseText(rendered);
  // A scanned / image-only PDF has streams but draws no words: that is the normal
  // outcome for a photocopied page and the caller has to explain it. A short but
  // real text layer is NOT an error here — ingestBuffer judges usability
  // separately with estimateQuality.
  if (streams.length === 0 || textOps === 0 || text.replace(/\s/g, '').length < 2) {
    throw ingestError('no_text_layer', MESSAGES.no_text_layer);
  }
  if (decoder.stats.unmapped > 0) {
    warnings.push('Some characters in this PDF were not listed in its font map, so a few words may look '
      + 'slightly wrong. Please check them before generating questions.');
  }
  if (decoder.hasMap && decoder.twoByte) {
    warnings.push('This PDF uses a two-byte font encoding, so a small number of characters may be approximate.');
  }
  return { text, pages: countPdfPages(raw), method: 'text-layer', warnings, bytesScanned };
}

/* ---- SECTION 5 — DOCX: hand-written ZIP + WordprocessingML ----------- */
// CRC32 (IEEE 802.3, the polynomial ZIP uses) for payload verification.
let CRC_TABLE = null;
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
// Find the End Of Central Directory record (PK\x05\x06) by scanning backwards.
function findEndOfCentralDirectory(bytes) {
  const maxScan = Math.min(bytes.length, 65557); // the comment field is at most 65535 bytes
  for (let i = bytes.length - 22; i >= bytes.length - maxScan && i >= 0; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) return i;
  }
  return -1;
}

/*
 * Read a ZIP archive's entries (a .docx is one) from its central directory.
 * Each entry carries the compression method, the CRC32, both sizes and the
 * offset of its local file header; the local header then supplies the name and
 * extra-field lengths, so the payload offset stays exact even for writers that
 * use a data descriptor (flag bit 3). Method 0 is stored, method 8 deflated, and
 * every inflated payload is checked against the CRC32 in the directory.
 */
async function readZipEntries(bytes) {
  const eocd = findEndOfCentralDirectory(bytes);
  if (eocd < 0) throw ingestError('unreadable', MESSAGES.unreadable);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entryCount = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true); // start of the central directory
  const entries = [];
  for (let index = 0; index < entryCount; index++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) break; // PK\x01\x02
    const method = view.getUint16(cursor + 10, true);
    const expectedCrc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = latin1(bytes, cursor + 46, cursor + 46 + nameLength);
    cursor += 46 + nameLength + extraLength + commentLength;

    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) continue; // PK\x03\x04
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const payload = bytes.subarray(dataStart, Math.min(dataStart + compressedSize, bytes.length));
    const data = method === 0 ? payload : method === 8 ? await inflateBytes(payload) : null;
    if (!data) continue;
    entries.push({ name, method, data, crcOk: crc32(data) === expectedCrc });
  }
  if (entries.length === 0) throw ingestError('unreadable', MESSAGES.unreadable);
  return entries;
}

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
// Decode &amp; &lt; &gt; &quot; &apos; &#NN; and &#xHH; in already tag-free text.
function decodeXmlEntities(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (match, body) => {
    if (body.charAt(0) === '#') {
      const isHex = body.charAt(1) === 'x' || body.charAt(1) === 'X';
      const code = parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      return codePointToString(code) || match;
    }
    return Object.prototype.hasOwnProperty.call(XML_ENTITIES, body) ? XML_ENTITIES[body] : match;
  });
}
/*
 * WordprocessingML → text: </w:p> becomes a newline, <w:br/> and <w:tab/> become
 * a space, every other tag is stripped, and only then are entities decoded — so
 * an escaped &lt; can never be mistaken for a real tag.
 */
function docxXmlToText(xml) {
  return decodeXmlEntities(xml
    .replace(/<w:tab\b[^>]*\/?>/g, ' ')
    .replace(/<w:br\b[^>]*\/?>/g, ' ')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]*>/g, ''));
}

/**
 * Extract the text of a .docx: word/document.xml, plus the footnote and endnote
 * parts when the document has them. ASYNC, because ZIP inflation is async.
 *
 * @param {Uint8Array|ArrayBuffer|Buffer} bytesInput
 * @returns {Promise<{ text: string, method: 'xml', warnings: string[] }>}
 * @throws {Error} .code 'unreadable'
 */
export async function extractDocxText(bytesInput) {
  const bytes = toUint8(bytesInput);
  const warnings = [];
  let entries;
  try {
    entries = await readZipEntries(bytes);
  } catch (error) {
    if (error && error.code === 'unreadable') throw error;
    throw ingestError('unreadable', MESSAGES.unreadable);
  }
  const parts = [];
  let damaged = false;
  for (const name of ['word/document.xml', 'word/footnotes.xml', 'word/endnotes.xml']) {
    const entry = entries.find((item) => item.name === name);
    if (!entry) continue;
    if (!entry.crcOk) damaged = true; // keep going: a partly readable file still helps
    parts.push(docxXmlToText(latin1(entry.data)));
  }
  if (parts.length === 0) throw ingestError('unreadable', MESSAGES.unreadable);
  if (damaged) {
    warnings.push('Part of this document looked damaged, so a few words may be missing. Please check the '
      + 'text before generating questions.');
  }
  return { text: parts.join('\n'), method: 'xml', warnings };
}

/* ---- SECTION 6 — public ingestion API -------------------------------- */
// File extension, lower case without the dot ('' when there is none).
function extensionOf(fileName) {
  const name = String(fileName || '');
  const dot = name.lastIndexOf('.');
  return dot < 0 || dot === name.length - 1 ? '' : name.slice(dot + 1).toLowerCase();
}
// Magic-byte sniffing, used only when the extension is missing or unknown.
function sniffKind(bytes) {
  if (bytes.length >= 5 && latin1(bytes, 0, 5) === '%PDF-') return 'pdf';
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return 'docx';
  return null;
}
// The success shape, in one place so the paths below cannot drift apart.
function successResult({ fileName, bytes, kind, text, pages, quality, method, warnings }) {
  return {
    ok: true,
    file_name: fileName,
    bytes,
    kind,
    text,
    characters: text.length,
    words: text.split(/\s+/).filter(Boolean).length,
    pages,
    quality,
    method,
    warnings: [...warnings],
  };
}

/**
 * Turn raw bytes into clean lesson text. Never throws.
 *
 * @param {Uint8Array|ArrayBuffer|Buffer} bytesInput
 * @param {string} [fileName] used for extension routing and reported back
 * @param {{ maxCharacters?: number }} [options] caps the returned text (≤ 200000)
 * @returns {Promise<object>} the success shape, or { ok:false, error, message, warnings }
 */
export async function ingestBuffer(bytesInput, fileName = '', options = {}) {
  const warnings = [];
  const name = typeof fileName === 'string' ? fileName : '';
  let bytes;
  try {
    bytes = toUint8(bytesInput);
  } catch {
    return failure('unreadable', warnings);
  }
  if (bytes.length === 0) return failure('empty', warnings);
  if (bytes.length > MAX_FILE_BYTES) return failure('too_large', warnings);

  const kind = KIND_BY_EXTENSION[extensionOf(name)] || sniffKind(bytes);
  if (!kind) return failure('unsupported_type', warnings);

  try {
    if (kind === 'pdf' || kind === 'docx') {
      let extracted;
      try {
        extracted = kind === 'pdf' ? await extractPdfText(bytes, options) : await extractDocxText(bytes);
      } catch (error) {
        const code = error && error.code ? error.code : 'unreadable';
        if (code === 'no_text_layer') {
          warnings.push('This PDF has no selectable words — it is probably a scan or a photo of pages. Questions '
            + 'can only be built from words we can read, so please paste the text instead.');
        } else if (code === 'encrypted') {
          warnings.push('Password-protected PDFs must be unlocked before we can read them.');
        }
        return failure(code, warnings);
      }
      warnings.push(...(extracted.warnings || []));
      const text = normaliseText(extracted.text, options);
      const quality = estimateQuality(text);
      if (quality < MIN_QUALITY) {
        warnings.push(kind === 'pdf'
          ? 'Very little readable text was found in this PDF. Please paste the text instead so the questions match your lesson.'
          : 'This Word file seems to contain almost no readable words. Please check the file or paste the text instead.');
        return failure(kind === 'pdf' ? 'no_text_layer' : 'empty', warnings);
      }
      return successResult({
        fileName: name,
        bytes: bytes.length,
        kind,
        text,
        pages: kind === 'pdf' ? extracted.pages : null,
        quality,
        method: kind === 'pdf' ? 'text-layer' : 'xml',
        warnings,
      });
    }

    // Plain text family: .txt .text .md .markdown .csv .tsv
    const text = normaliseText(decodeUtf8(bytes), options);
    const quality = estimateQuality(text);
    if (text.length === 0 || quality < MIN_QUALITY) {
      warnings.push('This file does not look like readable lesson text. Please check the file or paste the '
        + 'text into the box.');
      return failure('empty', warnings);
    }
    return successResult({
      fileName: name, bytes: bytes.length, kind: 'text', text, pages: null, quality, method: 'plain', warnings,
    });
  } catch {
    // Last line of defence: malformed input must never escape as an exception.
    return failure('unreadable', warnings);
  }
}

/**
 * Ingest a browser File / Blob: anything with .name and .arrayBuffer() or .text().
 * Never throws — bad input comes back as a structured failure.
 *
 * @param {{ name?: string, size?: number, arrayBuffer?: () => Promise<ArrayBuffer>, text?: () => Promise<string> }} file
 * @returns {Promise<object>} the ingestBuffer result plus { file_name, bytes: size }
 */
export async function ingestFile(file) {
  if (!file || typeof file !== 'object') return { ...failure('unreadable'), file_name: '', bytes: 0 };
  const name = typeof file.name === 'string' ? file.name : '';
  const rejected = { ...failure('unreadable'), file_name: name, bytes: 0 };
  let buffer;
  try {
    if (typeof file.arrayBuffer === 'function') buffer = await file.arrayBuffer();
    else if (typeof file.text === 'function') {
      const asText = await file.text();
      buffer = typeof TextEncoder === 'function' ? new TextEncoder().encode(asText) : asciiBytes(asText);
    } else return rejected;
  } catch {
    return rejected;
  }
  let size = 0;
  try {
    size = toUint8(buffer).length;
  } catch {
    return rejected;
  }
  let result;
  try {
    result = await ingestBuffer(buffer, name);
  } catch {
    result = failure('unreadable');
  }
  return { ...result, file_name: name, bytes: Number.isFinite(file.size) ? file.size : size };
}

export default ingestFile;
