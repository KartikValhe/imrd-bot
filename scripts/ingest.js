// Rebuilds the knowledge base from Excel files in docs/ or docs/data/
// Usage:
//   npm run ingest                     (auto-scans all .xlsx/.xls in docs/ and docs/data/)
//   npm run ingest -- docs/data/main_dataset.xlsx
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { embedTexts } = require('../api/_lib/llm');

const ROOT_DIR = path.join(__dirname, '..');
const DEFAULT_DOCS_DIR = path.join(ROOT_DIR, 'docs');
const DEFAULT_DOCS_DATA_DIR = path.join(ROOT_DIR, 'docs', 'data');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const MAX_CHARS = 900;
const OVERLAP = 150;

function normalize(val) {
  return val === undefined || val === null ? '' : String(val).trim();
}

function findKey(row, ...candidates) {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const found = keys.find(k => k.trim().toLowerCase() === c.toLowerCase());
    if (found) return row[found];
  }
  return undefined;
}

// Parses an individual workbook into standardized document objects
function parseWorkbook(filePath) {
  const fileName = path.basename(filePath);
  const workbook = XLSX.readFile(filePath);
  const docs = [];

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false });
    if (!rows.length) continue;

    // Check if this sheet is the Koha Library catalog (thousands of book copies)
    const firstRow = rows[0] || {};
    const isKohaSheet = (
      findKey(firstRow, 'New  Acc No. As per Koha', 'Acc No', 'New Acc No') !== undefined ||
      (findKey(firstRow, 'TITLE  NAME', 'TITLE NAME') !== undefined && findKey(firstRow, 'MAIN SUBJECT', 'CLASSNO') !== undefined)
    );

    if (isKohaSheet) {
      console.log(`  Processing Koha Library Catalog from ${fileName} [${sheetName}] (${rows.length} rows)...`);
      // Group books by unique title + author to build rich, non-redundant catalog records
      const booksByTitle = new Map();
      for (const rawRow of rows) {
        const title = normalize(findKey(rawRow, 'TITLE  NAME', 'TITLE NAME', 'Title'));
        if (!title) continue;
        const author1 = normalize(findKey(rawRow, 'AUTHOR                          NAME 1', 'AUTHOR NAME 1', 'Author'));
        const author2 = normalize(findKey(rawRow, 'Author Name 2 (if any)', 'Author 2'));
        const author = [author1, author2].filter(Boolean).join(', ');
        const key = `${title.toLowerCase()}::${author.toLowerCase()}`;

        const accNo = normalize(findKey(rawRow, 'New  Acc No. As per Koha', 'Acc No'));
        const status = normalize(findKey(rawRow, 'STATUS', 'Status'));
        const subject = normalize(findKey(rawRow, 'MAIN SUBJECT', 'Subject'));
        const subSubject = normalize(findKey(rawRow, 'SUB SUBJECT'));
        const dept = normalize(findKey(rawRow, 'DEPT NAME', 'Department'));
        const bookType = normalize(findKey(rawRow, 'DOCUMENT/ BOOK TYPE', 'Type'));
        const pubYear = normalize(findKey(rawRow, 'P                  YEAR', 'Year'));
        const publisher = normalize(findKey(rawRow, 'PUB NAME', 'Publisher'));
        const keywords = normalize(findKey(rawRow, 'KEYWORDS', 'Keywords'));

        if (!booksByTitle.has(key)) {
          booksByTitle.set(key, {
            title,
            author: author || 'N/A',
            subject: [subject, subSubject].filter(Boolean).join(' - ') || 'N/A',
            dept: dept || 'N/A',
            bookType: bookType || 'Book',
            pubYear,
            publisher,
            keywords,
            accNos: accNo ? [accNo] : [],
            statuses: status ? [status] : []
          });
        } else {
          const entry = booksByTitle.get(key);
          if (accNo && !entry.accNos.includes(accNo) && entry.accNos.length < 10) {
            entry.accNos.push(accNo);
          }
          if (status && !entry.statuses.includes(status)) {
            entry.statuses.push(status);
          }
        }
      }

      let rowId = 1;
      for (const b of booksByTitle.values()) {
        let text = `Library Book: ${b.title}\nAuthor: ${b.author}`;
        if (b.subject && b.subject !== 'N/A') text += `\nSubject: ${b.subject}`;
        if (b.dept && b.dept !== 'N/A') text += `\nDepartment: ${b.dept}`;
        if (b.bookType) text += `\nType: ${b.bookType}`;
        if (b.publisher) text += `\nPublisher: ${b.publisher} (${b.pubYear || ''})`;
        if (b.keywords) text += `\nKeywords: ${b.keywords}`;
        if (b.accNos.length) text += `\nAccession Nos / Copies: ${b.accNos.join(', ')}`;
        if (b.statuses.length) text += `\nAvailability Status: ${b.statuses.join(', ')}`;

        docs.push({
          doc_type: 'library_book',
          headerPrefix: `Library Book: ${b.title} (${b.author})\n`,
          text,
          metadata: {
            source: fileName,
            sheet_name: sheetName,
            row_id: rowId++,
            category: 'Library Catalog',
            page_title: b.title,
            section: b.subject,
            url: 'https://www.rcpimrd.ac.in/library-overview',
            department: b.dept,
            doc_type: 'library_book'
          }
        });
      }
      console.log(`  -> Synthesized ${booksByTitle.size} unique library title entries.`);
      continue;
    }

    // Standard Q&A or Scraped Page or Tabular
    for (const rawRow of rows) {
      const row = {};
      for (const [key, val] of Object.entries(rawRow)) row[String(key).trim()] = val;
      const rowId = (rawRow.__rowNum__ !== undefined ? rawRow.__rowNum__ + 1 : docs.length + 1);

      const questionVal = findKey(row, 'Question', 'Query', 'Prompt');
      const answerVal = findKey(row, 'Answer', 'Response');
      const contentTextVal = findKey(row, 'Content Text', 'Content_Text', 'Content');

      if (questionVal !== undefined && answerVal !== undefined) {
        // Q&A document format (e.g. main_dataset.xlsx, Library_Chatbot_QA.xlsx)
        const question = normalize(questionVal);
        const answer = normalize(answerVal);
        if (!question && !answer) continue;

        const category = normalize(findKey(row, 'Category', 'Category/Department')) || sheetName;
        const pageTitle = normalize(findKey(row, 'Source Page', 'Source_Page', 'Page Title', 'Page_Title'));
        const url = normalize(findKey(row, 'Source URL', 'Source_URL', 'Page URL', 'Page_URL', 'URL')) || 'https://www.rcpimrd.ac.in/';
        const department = normalize(findKey(row, 'Department')) || 'N/A';

        let text = `Question: ${question}\nAnswer: ${answer}`;
        if (category && category !== 'Sheet1') text += `\nCategory: ${category}`;
        if (pageTitle) text += `\nSource Page: ${pageTitle}`;
        if (url) text += `\nURL: ${url}`;

        docs.push({
          doc_type: 'qa',
          headerPrefix: `Question: ${question}\n`,
          text,
          metadata: {
            source: fileName,
            sheet_name: sheetName,
            row_id: rowId,
            category: category || 'General',
            page_title: pageTitle || 'RCPET IMRD FAQ',
            section: '',
            url: url || 'https://www.rcpimrd.ac.in/',
            department,
            doc_type: 'qa'
          }
        });
      } else if (contentTextVal !== undefined) {
        // Scraped web page format (e.g. rcpimrd_scraped_data.xlsx)
        const content = normalize(contentTextVal);
        if (!content) continue;

        const pageTitle = normalize(findKey(row, 'Page Title', 'Page_Title', 'Title')) || sheetName;
        const section = normalize(findKey(row, 'Section Heading', 'Section_Heading', 'Heading'));
        const url = normalize(findKey(row, 'Page URL', 'Page_URL', 'URL')) || 'https://www.rcpimrd.ac.in/';

        let text = `RCPET IMRD Page: ${pageTitle}`;
        if (section) text += `\nSection: ${section}`;
        if (url) text += `\nURL: ${url}`;
        text += `\nContent: ${content}`;

        const headerPrefix = `RCPET IMRD Page: ${pageTitle}${section ? ' - ' + section : ''}\n`;

        docs.push({
          doc_type: 'scraped_page',
          headerPrefix,
          text,
          metadata: {
            source: fileName,
            sheet_name: sheetName,
            row_id: rowId,
            category: pageTitle,
            page_title: pageTitle,
            section: section || '',
            url: url || 'https://www.rcpimrd.ac.in/',
            department: 'N/A',
            doc_type: 'scraped_page'
          }
        });
      } else {
        // Generic tabular format
        const text = Object.entries(row)
          .filter(([col, val]) => normalize(val) && col.toLowerCase() !== 'content length' && col !== '__rowNum__')
          .map(([col, val]) => `${col}: ${normalize(val)}`)
          .join('\n');
        if (!text.trim()) continue;

        docs.push({
          doc_type: 'generic',
          headerPrefix: '',
          text,
          metadata: {
            source: fileName,
            sheet_name: sheetName,
            row_id: rowId,
            category: sheetName,
            page_title: sheetName,
            section: '',
            url: 'https://www.rcpimrd.ac.in/',
            department: 'N/A',
            doc_type: 'generic'
          }
        });
      }
    }
  }
  return docs;
}

// Splits long documents into overlapping chunks, maintaining header context across chunks
function chunkDocument(doc) {
  const { text, metadata, headerPrefix = '' } = doc;
  if (text.length <= MAX_CHARS) {
    return [{ text, metadata: { ...metadata, chunk_index: 0, total_chunks: 1, char_length: text.length } }];
  }

  const lines = text.split('\n');
  let tableHeader = '';
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].trim().startsWith('|') && lines[i + 1].trim().startsWith('|---')) {
      tableHeader = lines[i].trim() + '\n' + lines[i + 1].trim() + '\n';
      break;
    }
  }

  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + MAX_CHARS;
    let chunkText = text.slice(start, end);

    if (end < text.length) {
      const lastDoubleNewline = chunkText.lastIndexOf('\n\n');
      if (lastDoubleNewline > MAX_CHARS * 0.5) {
        end = start + lastDoubleNewline + 2;
        chunkText = text.slice(start, end);
      } else {
        const lastNewline = chunkText.lastIndexOf('\n');
        if (lastNewline > MAX_CHARS * 0.55) {
          end = start + lastNewline + 1;
          chunkText = text.slice(start, end);
        } else {
          const lastSentence = Math.max(
            chunkText.lastIndexOf('. '),
            chunkText.lastIndexOf('? '),
            chunkText.lastIndexOf('! ')
          );
          if (lastSentence > MAX_CHARS * 0.6) {
            end = start + lastSentence + 2;
            chunkText = text.slice(start, end);
          } else {
            const lastSpace = chunkText.lastIndexOf(' ');
            if (lastSpace > MAX_CHARS * 0.6) {
              end = start + lastSpace + 1;
              chunkText = text.slice(start, end);
            }
          }
        }
      }
    }

    let fullText = chunkText.trim();
    if (start > 0) {
      if (tableHeader && fullText.startsWith('|') && !fullText.startsWith(tableHeader.trim())) {
        fullText = tableHeader + fullText;
      }
      if (headerPrefix && !fullText.startsWith(headerPrefix)) {
        fullText = headerPrefix + fullText;
      }
    }

    chunks.push({ text: fullText, metadata: { ...metadata, chunk_index: chunks.length } });
    if (end >= text.length) break;
    start = end - OVERLAP;
  }

  for (const c of chunks) {
    c.metadata.total_chunks = chunks.length;
    c.metadata.char_length = c.text.length;
  }
  return chunks;
}

// Automated Pre-Ingest URL Health Checker (sampled to verify network and endpoints)
async function checkLinkHealth(docs) {
  const allUrls = [...new Set(docs.map(d => d.metadata && d.metadata.url).filter(Boolean))];
  if (!allUrls.length) return;

  const sampleUrls = allUrls.slice(0, 20);
  console.log(`\n🔍 [Link Health] Verifying sample of ${sampleUrls.length} citation URLs...`);
  let validCount = 0;

  for (const url of sampleUrls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RCPIMRDBot/2.0' }
      }).catch(() => null);
      clearTimeout(timeout);
      if (res && res.status >= 200 && res.status < 400) {
        validCount++;
      }
    } catch { }
  }

  console.log(`  ✓ ${validCount}/${sampleUrls.length} sampled URLs active & verified.`);
}

function chunkId(meta) {
  const source = String(meta.source || 'unknown').replace(/[\s.]+/g, '_');
  const sheet = String(meta.sheet_name || 'sheet').replace(/[\s.]+/g, '_');
  return `doc_${source}_${sheet}_row_${meta.row_id}_chunk_${meta.chunk_index}`;
}

// Collect all Excel files from arguments or docs/ and docs/data folders
function resolveTargetFiles(args) {
  const defaultDirs = [
    DEFAULT_DOCS_DATA_DIR,
    DEFAULT_DOCS_DIR
  ];
  const targets = args.length ? args : defaultDirs;
  const filePaths = [];

  function collectFromDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const fullPath = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        collectFromDir(fullPath);
      } else if (ent.isFile() && !ent.name.startsWith('~$') && (ent.name.endsWith('.xlsx') || ent.name.endsWith('.xls'))) {
        // Skip redundant library.xlsx if Koha file exists
        if (ent.name.toLowerCase() === 'library.xlsx') {
          continue;
        }
        filePaths.push(fullPath);
      }
    }
  }

  for (const target of targets) {
    const resolved = path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
    if (!fs.existsSync(resolved)) continue;
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      collectFromDir(resolved);
    } else if (stat.isFile() && (resolved.endsWith('.xlsx') || resolved.endsWith('.xls'))) {
      filePaths.push(resolved);
    }
  }

  return [...new Set(filePaths)];
}

async function main() {
  const args = process.argv.slice(2);
  const files = resolveTargetFiles(args);

  if (!files.length) {
    console.error('No Excel files found to ingest. Place .xlsx files in docs/ or docs/data/.');
    process.exit(1);
  }

  console.log(`Found ${files.length} Excel file(s) for ingestion:`);
  files.forEach(f => console.log(`  - ${path.basename(f)}`));

  const allDocs = [];
  for (const file of files) {
    const docs = parseWorkbook(file);
    console.log(`  Parsed ${docs.length} entries from ${path.basename(file)}`);
    allDocs.push(...docs);
  }

  const chunks = allDocs.flatMap(chunkDocument);
  if (!chunks.length) {
    console.error('No valid content found across the Excel files.');
    process.exit(1);
  }

  // Pre-ingest link health verification
  await checkLinkHealth(allDocs);

  const EMBED_CACHE_FILE = path.join(DATA_DIR, 'embed_cache.json');
  let embedCache = {};
  if (fs.existsSync(EMBED_CACHE_FILE)) {
    try {
      embedCache = JSON.parse(fs.readFileSync(EMBED_CACHE_FILE, 'utf8'));
      console.log(`Loaded ${Object.keys(embedCache).length} cached embeddings from disk.`);
    } catch { embedCache = {}; }
  }

  const crypto = require('crypto');
  function hash(str) {
    return crypto.createHash('sha256').update(str).digest('hex');
  }

  const missingTexts = [];
  const missingIndices = [];
  const embeddings = new Array(chunks.length);

  for (let i = 0; i < chunks.length; i++) {
    const h = hash(chunks[i].text);
    if (embedCache[h]) {
      embeddings[i] = embedCache[h];
    } else {
      missingTexts.push(chunks[i].text);
      missingIndices.push(i);
    }
  }

  if (missingTexts.length > 0) {
    console.log(`Generating embeddings for ${missingTexts.length} new chunks (${chunks.length - missingTexts.length} retrieved from cache)...`);
    // Batch and save progress every 5 batches
    const BATCH_SIZE = 128;
    const totalBatches = Math.ceil(missingTexts.length / BATCH_SIZE);
    for (let b = 0; b < missingTexts.length; b += BATCH_SIZE) {
      const batchTexts = missingTexts.slice(b, b + BATCH_SIZE);
      const batchIndices = missingIndices.slice(b, b + BATCH_SIZE);
      const batchNum = Math.floor(b / BATCH_SIZE) + 1;
      console.log(`  Embedding batch ${batchNum} of ${totalBatches} (${batchTexts.length} texts)...`);
      const batchEmbs = await embedTexts(batchTexts, BATCH_SIZE);
      for (let j = 0; j < batchIndices.length; j++) {
        const idx = batchIndices[j];
        const emb = batchEmbs[j];
        embeddings[idx] = emb;
        embedCache[hash(chunks[idx].text)] = emb;
      }
      if (batchNum % 5 === 0 || b + BATCH_SIZE >= missingTexts.length) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(EMBED_CACHE_FILE, JSON.stringify(embedCache));
      }
    }
  } else {
    console.log(`All ${chunks.length} embeddings retrieved instantly from disk cache!`);
  }

  const dim = embeddings[0].length;
  const vectors = new Float32Array(chunks.length * dim);
  embeddings.forEach((emb, i) => vectors.set(emb, i * dim));

  const meta = {
    mtime: Date.now(),
    count: chunks.length,
    sources: files.map(f => path.basename(f)),
    items: chunks.map(c => ({ id: chunkId(c.metadata), text: c.text, metadata: c.metadata }))
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const binPath = path.join(DATA_DIR, 'vector_cache.bin');
  const metaPath = path.join(DATA_DIR, 'vector_meta.json');

  fs.writeFileSync(binPath + '.tmp', Buffer.from(vectors.buffer));
  fs.writeFileSync(metaPath + '.tmp', JSON.stringify(meta, null, 2));
  fs.renameSync(binPath + '.tmp', binPath);
  fs.renameSync(metaPath + '.tmp', metaPath);

  const binSizeMb = (fs.statSync(binPath).size / (1024 * 1024)).toFixed(2);
  console.log(`\nSuccessfully built RCPET's IMRD Knowledge Base:`);
  console.log(`  - Chunks: ${chunks.length}`);
  console.log(`  - Dimensions: ${dim}`);
  console.log(`  - Vector cache: ${binPath} (${binSizeMb} MB)`);
  console.log(`  - Metadata: ${metaPath}`);

  // Flush Redis cache to invalidate outdated cached responses
  try {
    const redisCache = require('../api/_lib/redisCache');
    await redisCache.flush();
  } catch { }
}

main().catch(err => {
  console.error('Ingestion failed:', err.message);
  process.exit(1);
});
