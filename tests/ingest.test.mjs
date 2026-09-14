/**
 * QUIZVERSE — DOCUMENT INGEST unit tests
 * Run:  node --test tests/ingest.test.mjs
 *
 * Every fixture (PDF, DOCX/ZIP, garbage, text) is built in code — there are no
 * binary fixture files and no network access. Everything is deterministic.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, deflateRawSync } from 'node:zlib';

import {
  ingestFile,
  ingestBuffer,
  extractPdfText,
  extractDocxText,
  estimateQuality,
  normaliseText,
  MIN_QUALITY,
} from '../app/document-ingest.js';

/* ------------------------------------------------------------------ */
/* fixture helpers                                                     */
/* ------------------------------------------------------------------ */

/** UTF-8 bytes of a string. */
const utf8 = (text) => new TextEncoder().encode(text);

/** Bytes of a string where every char code is one byte (PDF syntax is ASCII). */
const bin = (text) => Uint8Array.from(text, (ch) => ch.charCodeAt(0) & 0xff);

/** Latin-1 string of a byte array (never used for real UTF-8 assertions). */
function latin1(bytes) {
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

function concat(list) {
  let total = 0;
  for (const part of list) total += part.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of list) { out.set(part, at); at += part.length; }
  return out;
}

/** A minimal (xref-free) PDF object. */
const pdfObject = (number, body) => bin(`${number} 0 obj\n${body}\nendobj\n`);

/** A PDF stream object. `dict` is extra dictionary text, `data` raw payload bytes. */
function pdfStreamObject(number, dict, data) {
  const head = bin(`${number} 0 obj\n<< /Length ${data.length}${dict ? ` ${dict}` : ''} >>\nstream\n`);
  return concat([head, data, bin('\nendstream\nendobj\n')]);
}

/**
 * Assemble the bytes of a tiny but valid-looking PDF.
 * objects: array of Uint8Array, trailer: extra trailer dictionary text.
 */
function assemblePdf(objects, trailer = '') {
  return concat([
    bin('%PDF-1.4\n'),
    ...objects,
    bin(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${trailer} >>\n%%EOF\n`),
  ]);
}

/** The three boilerplate objects every fixture PDF shares (catalog/pages/page). */
function pdfBoilerplate(fontRef = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>') {
  return [
    pdfObject(1, '<< /Type /Catalog /Pages 2 0 R >>'),
    pdfObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    pdfObject(3, '<< /Type /Page /Parent 2 0 R /Contents 4 0 R '
      + '/MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> >>'),
    null, // slot 4: the content stream, filled in by the caller
    pdfObject(5, fontRef),
  ];
}

/* ---------------------------- ZIP / DOCX --------------------------- */

let CRC_TABLE = null;
function testCrc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Build a real ZIP archive by hand: local file header + payload for every
 * entry, then the central directory, then the EOCD record.
 * entries: [{ name, text, method }] with method 0 (stored) or 8 (raw deflate).
 */
function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const data = utf8(entry.text);
    const method = entry.method === 8 ? 8 : 0;
    const payload = method === 8 ? new Uint8Array(deflateRawSync(data)) : data;
    const crc = testCrc32(data);
    const nameBytes = bin(entry.name);

    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, method, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, payload.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, method, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, payload.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    localParts.push(local, payload);
    centralParts.push(central);
    offset += local.length + payload.length;
  }

  const centralBytes = concat(centralParts);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralBytes.length, true);
  eocdView.setUint32(16, offset, true);
  eocdView.setUint16(20, 0, true);

  return concat([...localParts, centralBytes, eocd]);
}

const DOCX_DOCUMENT_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
  + '<w:p><w:r><w:t>The water cycle is a continuous process.</w:t></w:r></w:p>'
  + '<w:p><w:r><w:t>Water moves as vapour &amp; liquid.</w:t></w:r>'
  + '<w:r><w:t xml:space="preserve"> Clouds form when the air cools.</w:t></w:r></w:p>'
  + '</w:body></w:document>';

const DOCX_FOOTNOTES_XML = '<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
  + '<w:footnote><w:p><w:r><w:t>Footnote: rain falls back to the ground.</w:t></w:r></w:p></w:footnote>'
  + '</w:footnotes>';

/** A complete .docx, with document.xml either deflated (method 8) or stored (0). */
function buildDocx({ documentMethod = 8, withFootnotes = true } = {}) {
  const entries = [
    { name: '[Content_Types].xml', text: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>', method: 0 },
    { name: 'word/document.xml', text: DOCX_DOCUMENT_XML, method: documentMethod },
  ];
  if (withFootnotes) entries.push({ name: 'word/footnotes.xml', text: DOCX_FOOTNOTES_XML, method: 0 });
  return buildZip(entries);
}

/* ------------------------------------------------------------------ */
/* A. plain text, Markdown and CSV                                     */
/* ------------------------------------------------------------------ */

const LESSON_TXT = 'The water cycle has three steps.\r\n'
  + '\r\n'
  + '\r\n'
  + 'Evaporation happens when the sun heats water.\n'
  + '\n'
  + 'Condensation    forms    clouds.\n';

test('A — a plain text file ingests with high quality and correct counts', async () => {
  const res = await ingestBuffer(utf8(LESSON_TXT), 'water-cycle.txt');
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.kind, 'text');
  assert.equal(res.method, 'plain');
  assert.equal(res.file_name, 'water-cycle.txt');
  assert.equal(res.pages, null);
  assert.ok(res.quality >= MIN_QUALITY, `quality ${res.quality}`);
  assert.equal(res.characters, res.text.length);
  assert.ok(res.words >= 12, `words ${res.words}`);
  assert.ok(Array.isArray(res.warnings));
});

test('A — normalisation collapses whitespace, blank lines and carriage returns', async () => {
  const res = await ingestBuffer(utf8(LESSON_TXT), 'water-cycle.txt');
  assert.ok(!res.text.includes('\r'), 'carriage returns are gone');
  assert.ok(!res.text.includes('  '), 'double spaces are gone');
  assert.ok(!res.text.includes('\n\n\n'), 'blank lines are collapsed');
  assert.equal(res.text.split('\n')[0], 'The water cycle has three steps.');
  assert.ok(res.text.includes('Condensation forms clouds.'));
});

test('A — Markdown and CSV are treated as text, and normaliseText is idempotent', async () => {
  const md = await ingestBuffer(utf8('# Water Cycle\n\n- Evaporation\n- Condensation\n'), 'notes.md');
  assert.equal(md.ok, true);
  assert.equal(md.kind, 'text');
  assert.ok(md.text.startsWith('# Water Cycle'));

  const csv = await ingestBuffer(utf8('Term, Meaning\nEvaporation, water turns into vapour\nCondensation, vapour turns into drops\n'), 'terms.csv');
  assert.equal(csv.ok, true);
  assert.equal(csv.kind, 'text');

  const once = normaliseText('Hello   world\r\n\r\n\r\nagain  ');
  assert.equal(once, 'Hello world\n\nagain');
  assert.equal(normaliseText(once), once);
});

test('A — ingestFile reads a File-like object and reports the size', async () => {
  const bytes = utf8(LESSON_TXT);
  const fakeFile = {
    name: 'lesson.txt',
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
  const res = await ingestFile(fakeFile);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.file_name, 'lesson.txt');
  assert.equal(res.bytes, bytes.length);
  assert.ok(res.text.includes('Evaporation happens when the sun heats water.'));
});

/* ------------------------------------------------------------------ */
/* B. hand-built PDF with a FlateDecode content stream                 */
/* ------------------------------------------------------------------ */

const CONTENT_B = 'BT\n/F1 12 Tf\n72 720 Td\n(The water cycle has three main steps.) Tj\nET\n'
  + 'BT\n/F1 12 Tf\n72 700 Td\n'
  + '[(First,) -250 (water) -250 (evaporates) -250 (into) -250 (the) -250 (air.)] TJ\nET\n';

function buildTextPdf() {
  const objects = pdfBoilerplate();
  objects[3] = pdfStreamObject(4, '/Filter /FlateDecode', new Uint8Array(deflateSync(bin(CONTENT_B))));
  return assemblePdf(objects);
}

test('B — a FlateDecode PDF yields its text layer, Tj and TJ included', async () => {
  const extracted = await extractPdfText(buildTextPdf());
  assert.equal(extracted.method, 'text-layer');
  assert.ok(extracted.pages >= 1, `pages ${extracted.pages}`);
  assert.ok(extracted.text.includes('The water cycle has three main steps.'), extracted.text);
  assert.ok(extracted.text.includes('First, water evaporates into the air.'), extracted.text);
  assert.ok(extracted.bytesScanned > 0);
});

test('B — text operators keep their order and TJ chunks get spaces', async () => {
  const { text } = await extractPdfText(buildTextPdf());
  const first = text.indexOf('The water cycle has three main steps.');
  const second = text.indexOf('First, water evaporates into the air.');
  assert.ok(first >= 0 && second > first, text);
  assert.ok(!text.includes('First,water'), 'TJ chunks must not glue together');
  assert.ok(!text.includes('theair.'), 'TJ chunks must not glue together');
});

test('B — the same PDF flows through ingestBuffer as a usable pdf result', async () => {
  const res = await ingestBuffer(buildTextPdf(), 'lesson.pdf');
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.kind, 'pdf');
  assert.equal(res.method, 'text-layer');
  assert.ok(res.pages >= 1);
  assert.ok(res.quality >= MIN_QUALITY, `quality ${res.quality}`);
  assert.ok(res.words >= 10);
  assert.ok(res.text.includes('First, water evaporates into the air.'));
});

/* ------------------------------------------------------------------ */
/* C. PDF with a ToUnicode CMap (bfchar + bfrange)                     */
/* ------------------------------------------------------------------ */

const CMAP_BODY = '/CIDInit /ProcSet findresource begin\n'
  + '12 dict begin\n'
  + 'begincmap\n'
  + '/CMapName /QuizVerseToUnicode def\n'
  + '1 begincodespacerange\n<00> <FF>\nendcodespacerange\n'
  + '2 beginbfchar\n<01> <0041>\n<02> <0915>\nendbfchar\n'
  + '1 beginbfrange\n<10> <12> <0061>\nendbfrange\n'
  + 'endcmap\n'
  + 'CMapName currentdict /CMap defineresource pop\n'
  + 'end\nend\n';

function buildCmapPdf() {
  const objects = pdfBoilerplate('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /ToUnicode 6 0 R >>');
  // Codes 0x01 0x02 0x10 0x11 0x12 — unreadable as Latin-1 without the CMap.
  const content = 'BT\n/F1 12 Tf\n72 720 Td\n(\\001\\002\\020\\021\\022) Tj\nET\n';
  objects[3] = pdfStreamObject(4, '/Filter /FlateDecode', new Uint8Array(deflateSync(bin(content))));
  objects.push(pdfStreamObject(6, '', bin(CMAP_BODY)));
  return assemblePdf(objects);
}

test('C — the ToUnicode CMap remaps raw codes to real characters', async () => {
  const { text } = await extractPdfText(buildCmapPdf());
  assert.ok(text.includes('A\u0915abc'), `expected the CMap mapping, got ${JSON.stringify(text)}`);
  assert.ok(!text.includes('\u0001'), 'raw control codes must not survive');
});

test('C — without a CMap, bytes fall back to Latin-1/WinAnsi decoding', async () => {
  const objects = pdfBoilerplate();
  // \262 = 0xB2 ("²") and \222 = 0x92 (a Windows-1252 right single quote).
  const content = 'BT\n/F1 12 Tf\n72 720 Td\n(The water is H\\262O, it\\222s a compound.) Tj\nET\n';
  objects[3] = pdfStreamObject(4, '/Filter /FlateDecode', new Uint8Array(deflateSync(bin(content))));
  const { text } = await extractPdfText(assemblePdf(objects));
  assert.ok(text.includes('H\u00b2O'), `expected the Latin-1 byte 0xB2, got ${JSON.stringify(text)}`);
  assert.ok(text.includes('it\u2019s'), `expected the WinAnsi byte 0x92, got ${JSON.stringify(text)}`);
  assert.ok(!text.includes('\u0915'), 'no Devanagari without a CMap');
});

test('C — a CMap-less PDF whose codes are all control bytes reports no_text_layer', async () => {
  const objects = pdfBoilerplate();
  const content = 'BT\n/F1 12 Tf\n72 720 Td\n(\\001\\002\\020\\021\\022) Tj\nET\n';
  objects[3] = pdfStreamObject(4, '/Filter /FlateDecode', new Uint8Array(deflateSync(bin(content))));
  await assert.rejects(
    () => extractPdfText(assemblePdf(objects)),
    (error) => error.code === 'no_text_layer',
  );
});

/* ------------------------------------------------------------------ */
/* D. hand-built DOCX (real ZIP, stored + deflated entries)            */
/* ------------------------------------------------------------------ */

test('D — a deflated .docx yields both paragraphs on separate lines with entities decoded', async () => {
  const res = await ingestBuffer(buildDocx({ documentMethod: 8 }), 'water.docx');
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.kind, 'docx');
  assert.equal(res.method, 'xml');
  assert.equal(res.pages, null);

  const lines = res.text.split('\n').filter(Boolean);
  assert.equal(lines[0], 'The water cycle is a continuous process.');
  assert.equal(lines[1], 'Water moves as vapour & liquid. Clouds form when the air cools.');
  assert.ok(res.text.includes('&'), 'the &amp; entity is decoded');
  assert.ok(!res.text.includes('&amp;'), 'raw entities never reach the teacher');
  assert.ok(!res.text.includes('<w:'), 'no XML tags survive');
  assert.ok(res.text.includes('Footnote: rain falls back to the ground.'), 'footnotes.xml is included');
});

test('D — a stored (uncompressed) document.xml entry works too', async () => {
  const res = await ingestBuffer(buildDocx({ documentMethod: 0, withFootnotes: false }), 'stored.docx');
  assert.equal(res.ok, true, JSON.stringify(res));
  const lines = res.text.split('\n').filter(Boolean);
  assert.equal(lines.length, 2);
  assert.equal(lines[0], 'The water cycle is a continuous process.');
  assert.equal(lines[1], 'Water moves as vapour & liquid. Clouds form when the air cools.');
});

test('D — extractDocxText returns the XML method and warns about nothing on a clean file', async () => {
  const out = await extractDocxText(buildDocx());
  assert.equal(out.method, 'xml');
  assert.deepEqual(out.warnings, []);
  assert.ok(out.text.startsWith('The water cycle'));
});

/* ------------------------------------------------------------------ */
/* E. failure modes                                                    */
/* ------------------------------------------------------------------ */

/** 500 deterministic pseudo-random bytes — not text, not a known format. */
function binaryGarbage() {
  const bytes = new Uint8Array(500);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37 + 11) % 256;
  return bytes;
}

test('E — random binary garbage is refused with a friendly message', async () => {
  const res = await ingestBuffer(binaryGarbage(), 'mystery.bin');
  assert.equal(res.ok, false);
  assert.equal(res.error, 'unsupported_type');
  assert.equal(typeof res.message, 'string');
  assert.ok(res.message.length > 20, res.message);
  assert.ok(!/error:|undefined|null/i.test(res.message), res.message);
  assert.ok(Array.isArray(res.warnings));
  assert.deepEqual(Object.keys(res).sort(), ['error', 'message', 'ok', 'warnings']);
});

test('E — binary garbage named .txt is refused as empty, never thrown', async () => {
  const res = await ingestBuffer(binaryGarbage(), 'notes.txt');
  assert.equal(res.ok, false);
  assert.equal(res.error, 'empty');
  assert.ok(res.message.length > 20);
});

test('E — an empty file reports empty for every extension', async () => {
  for (const name of ['empty.txt', 'empty.pdf', 'empty.docx', '']) {
    const res = await ingestBuffer(new Uint8Array(0), name);
    assert.equal(res.ok, false, name);
    assert.equal(res.error, 'empty', name);
    assert.ok(res.message.length > 10, name);
  }
});

test('E — a password-protected PDF reports encrypted', async () => {
  const objects = pdfBoilerplate();
  objects[3] = pdfStreamObject(4, '/Filter /FlateDecode', new Uint8Array(deflateSync(bin(CONTENT_B))));
  const encrypted = assemblePdf(objects, ' /Encrypt 9 0 R');

  const res = await ingestBuffer(encrypted, 'locked.pdf');
  assert.equal(res.ok, false);
  assert.equal(res.error, 'encrypted');
  assert.ok(res.message.includes('password'), res.message);

  await assert.rejects(
    () => extractPdfText(encrypted),
    (error) => error.code === 'encrypted',
  );
});

test('E — a PDF whose only stream has no text operators reports no_text_layer', async () => {
  const objects = pdfBoilerplate();
  // A single full-page image: valid PDF drawing operators, zero text.
  objects[3] = pdfStreamObject(4, '/Filter /FlateDecode',
    new Uint8Array(deflateSync(bin('q\n612 0 0 792 0 0 cm\n/Im0 Do\nQ\n'))));
  const scanned = assemblePdf(objects);

  const res = await ingestBuffer(scanned, 'scanned.pdf');
  assert.equal(res.ok, false);
  assert.equal(res.error, 'no_text_layer');
  assert.ok(res.warnings.length >= 1, 'the teacher gets an explanation');
  assert.ok(res.message.toLowerCase().includes('paste'), res.message);

  await assert.rejects(
    () => extractPdfText(scanned),
    (error) => error.code === 'no_text_layer',
  );
});

test('E — a broken .docx and an unsupported .rtf never throw', async () => {
  const brokenDocx = await ingestBuffer(bin('PK\x03\x04 this is not really a zip archive'), 'broken.docx');
  assert.equal(brokenDocx.ok, false);
  assert.equal(brokenDocx.error, 'unreadable');

  const rtf = await ingestBuffer(utf8('{\\rtf1\\ansi Lesson text here.}'), 'notes.rtf');
  assert.equal(rtf.ok, false);
  assert.equal(rtf.error, 'unsupported_type');

  const notAFile = await ingestFile(null);
  assert.equal(notAFile.ok, false);
  assert.equal(notAFile.error, 'unreadable');
  assert.equal(notAFile.bytes, 0);

  const hostile = await ingestFile({ name: 'x.txt', size: 10, arrayBuffer: async () => { throw new Error('disk'); } });
  assert.equal(hostile.ok, false);
  assert.equal(hostile.error, 'unreadable');
  assert.ok(!JSON.stringify(hostile).includes('disk'), 'raw errors stay internal');
});

test('E — ingestBuffer accepts Buffer, ArrayBuffer and Uint8Array alike', async () => {
  const bytes = utf8(LESSON_TXT);
  const fromBuffer = await ingestBuffer(Buffer.from(bytes), 'a.txt');
  const fromArrayBuffer = await ingestBuffer(bytes.buffer.slice(0), 'a.txt');
  const fromView = await ingestBuffer(bytes, 'a.txt');
  assert.equal(fromBuffer.ok, true);
  assert.equal(fromBuffer.text, fromView.text);
  assert.equal(fromArrayBuffer.text, fromView.text);
});

/* ------------------------------------------------------------------ */
/* F. realistic material paragraph → generator-ready text              */
/* ------------------------------------------------------------------ */

const MATERIAL = 'Photosynthesis is the process by which green plants make their own food. '
  + 'Plants take in carbon dioxide from the air through small openings called stomata. '
  + 'Water and minerals travel up from the roots to the leaves. '
  + 'Using sunlight, the leaves change these ingredients into sugar and give out oxygen.';

test('F — every sentence of the source paragraph survives in order', async () => {
  const res = await ingestBuffer(utf8(MATERIAL), 'photosynthesis.txt');
  assert.equal(res.ok, true, JSON.stringify(res));

  const sentences = MATERIAL.split(/(?<=\.)\s+/).filter(Boolean);
  assert.equal(sentences.length, 4);

  let cursor = -1;
  for (const sentence of sentences) {
    const at = res.text.indexOf(sentence);
    assert.ok(at > cursor, `sentence out of order or missing: ${sentence}`);
    cursor = at;
  }
  assert.ok(res.quality > 0.6, `quality ${res.quality}`);
  assert.ok(res.words > 40, `words ${res.words}`);
  assert.equal(res.characters, res.text.length);
});

test('F — the same paragraph in Markdown keeps its sentence order too', async () => {
  const res = await ingestBuffer(utf8(`## Photosynthesis\n\n${MATERIAL}\n`), 'material.md');
  assert.equal(res.ok, true);
  const at = res.text.indexOf('Photosynthesis is the process');
  assert.ok(at >= 0);
  assert.ok(res.text.indexOf('give out oxygen.') > at);
});

/* ------------------------------------------------------------------ */
/* G. estimateQuality                                                  */
/* ------------------------------------------------------------------ */

test('G — a normal lesson paragraph scores high', () => {
  const score = estimateQuality(MATERIAL);
  assert.ok(score >= 0.6 && score <= 1, `score ${score}`);
  assert.ok(estimateQuality(`${MATERIAL} ${MATERIAL}`) >= 0.6);
});

test('G — 500 repeated characters score below MIN_QUALITY', () => {
  const repeated = 'z'.repeat(500);
  assert.ok(estimateQuality(repeated) < MIN_QUALITY, `score ${estimateQuality(repeated)}`);
  assert.ok(estimateQuality('.'.repeat(500)) < MIN_QUALITY);
});

test('G — binary garbage scores below MIN_QUALITY, raw or normalised', () => {
  const garbage = latin1(binaryGarbage());
  assert.ok(estimateQuality(garbage) < MIN_QUALITY, `raw score ${estimateQuality(garbage)}`);
  const cleaned = normaliseText(garbage);
  assert.ok(estimateQuality(cleaned) < MIN_QUALITY, `cleaned score ${estimateQuality(cleaned)}`);
});

test('G — empty and near-empty text score at the bottom of the range', () => {
  assert.equal(estimateQuality(''), 0);
  assert.equal(estimateQuality('   \n  '), 0);
  assert.ok(estimateQuality('Hi.') <= 0.2);
});
