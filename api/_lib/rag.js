const vectorStore = require('./vectorStore');
const llm = require('./llm');
const redisCache = require('./redisCache');

const TOP_K = parseInt(process.env.RAG_TOP_K || '6', 10);
// Maximum cosine distance (1 - similarity) for a snippet to count as relevant
const DISTANCE_THRESHOLD = parseFloat(process.env.RAG_DISTANCE_THRESHOLD || '0.58');

const GREETING_ANSWERS = {
  en: 'Hello! I am your AI campus assistant for RCPET\'s Institute of Management Research and Development (IMRD), Shirpur. ' +
      'I can help you with questions about admissions, courses (MCA, BCA, BBA, MMS), eligibility, fees, ' +
      'scholarships, library facilities, and placements. ' +
      'What would you like to know about RCPET\'s IMRD?',
  hi: 'नमस्ते! मैं आर. सी. पटेल आय.एम.आर.डी. (RCPET IMRD), शिरपूर का आधिकारिक एआई कैंपस सहायक हूँ। ' +
      'मैं प्रवेश, पाठ्यक्रम (MCA, BCA, BBA, MMS), पात्रता, फीस, छात्रवृत्ति, लाइब्रेरी और प्लेसमेंट ' +
      'से संबंधित प्रश्नों में आपकी सहायता कर सकता हूँ। ' +
      'आप RCPET IMRD के बारे में क्या जानना चाहते हैं?',
  mr: 'नमस्कार! मी आर. सी. पटेल इन्स्टिट्यूट ऑफ मॅनेजमेंट रिसर्च अँड डेव्हलपमेंट (RCPET\'s IMRD), शिरपूरचा अधिकृत AI कॅम्पस सहाय्यक आहे. ' +
      'मी तुम्हाला प्रवेश, अभ्यासक्रम (MCA, BCA, BBA, MMS), पात्रता, फी, शिष्यवृत्ती, ग्रंथालय आणि प्लेसमेंट ' +
      'संबंधित प्रश्नांमध्ये मदत करू शकतो. ' +
      'तुम्हाला RCPET IMRD बद्दल काय जाणून घ्यायचे आहे?'
};

const OUT_OF_SCOPE_ANSWERS = {
  en: 'I am the official AI assistant for RCPET\'s IMRD College, Shirpur. ' +
      'I can only answer questions related to RCPET\'s IMRD based on official institutional records. ' +
      'I do not have information regarding this query in my knowledge base. ' +
      'Please visit the official [RCPET\'s IMRD Website](https://www.rcpimrd.ac.in) or contact the campus administration for assistance.',
  hi: 'मैं आर. सी. पटेल आय.एम.आर.डी. (RCPET IMRD), शिरपूर का आधिकारिक एआई सहायक हूँ। ' +
      'मैं केवल आधिकारिक रिकॉर्ड के आधार पर संस्थान से संबंधित प्रश्नों के उत्तर दे सकता हूँ। ' +
      'मेरे ज्ञानकोष में इस विषय की जानकारी उपलब्ध नहीं है। ' +
      'आधिकारिक जानकारी के लिए कृपया [RCPET IMRD की आधिकारिक वेबसाइट](https://www.rcpimrd.ac.in) देखें या कॉलेज प्रशासन से संपर्क करें।',
  mr: 'मी आर. सी. पटेल आय.एम.आर.डी. (RCPET\'s IMRD), शिरपूरचा अधिकृत AI सहाय्यक आहे. ' +
      'मी केवळ अधिकृत नोंदींवर आधारित RCPET IMRD शी संबंधित प्रश्नांची उत्तरे देऊ शकतो. ' +
      'माझ्या ज्ञानकोशात या प्रश्नाची माहिती उपलब्ध नाही. ' +
      'अधिकृत माहितीसाठी कृपया [RCPET\'s IMRD अधिकृत संकेतस्थळ](https://www.rcpimrd.ac.in) ला भेट द्या किंवा कॉलेज प्रशासनाशी संपर्क साधा.'
};

const CAMPUS_INTENT_REGEX = /\b(stream|streams|course|courses|program|programs|degree|degrees|branch|branches|specialization|specializations|btech|mtech|mca|bca|bba|mba|phd|diploma|pharmacy|engineering|management|science|commerce|arts|design|architecture|nursing|physiotherapy|agriculture|marine|maritime|polytechnic|institute|institutes|faculty|faculties|department|departments|school|schools|college|colleges|admission|admissions|apply|application|form|registration|eligibility|criteria|cutoff|merit|acpc|seat|seats|intake|fee|fees|tuition|scholarship|scholarships|financial aid|hostel|hostels|room|rooms|mess|food|dining|canteen|cafeteria|bus|buses|transport|transportation|route|routes|library|sports|gym|wifi|hospital|clinic|medical|atm|bank|auditorium|infrastructure|campus|gate|address|location|map|reach|directions|located|situated|placement|placements|package|packages|salary|salaries|company|companies|recruit|recruiter|recruiters|recruitment|internship|internships|training|cdc|teacher|teachers|prof|professor|professors|hod|dean|principal|director|president|chancellor|vc|vice chancellor|staff|contact|email|phone|number|helpline|office|timing|timings|hours|exam|exams|examination|examinations|date sheet|timetable|hall ticket|admit card|result|results|grade|grades|marks|syllabus|curriculum|calendar|holiday|holidays|vacation|attendance|event|events|fest|fests|cultural|technical|club|clubs|nss|ncc|alumni|naac|nirf|rank|ranking|rankings|accreditation|affiliation|approved|aicte|ugc|pci|coa|bpharm|mpharm|llb|law|lab|labs|laboratory|laboratories|workshop|workshops|facility|facilities|amenity|amenities|founder|founded|established|establishment|motto|vision|mission|history|trust|patron|ganpatbhai|shree)\b/i;

const UNIVERSITY_SCOPE_REGEX = /\b(rcpimrd|imrd|rcpet|rc\s*patel|patel|shirpur)\b/i;
const EXPLICIT_TOPIC_REGEX = /\b(hostel|hostels|transport|transportation|bus|buses|library|sports|gym|canteen|mess|placement|placements|ranking|rankings|naac|nirf|scholarship|scholarships|btech|mtech|bca|mca|bba|mms|mba|phd|diploma|pharmacy|nursing|physiotherapy|agriculture|marine|maritime|architecture|design|campus|location|reach|wifi|hospital|atm|bank|faculty|staff|hod|hods|director|principal|teacher|teachers|admission|eligibility)\b/i;
const PRONOUN_FOLLOWUP_REGEX = /\b(it|its|this|that|they|their|these|those|there|same|here|cost|fee|fees|duration|eligibility|process|admission|timing|timings|structure|syllabus|cutoff|seats?)\b/i;

// Comprehensive dictionary for student typos and misspellings
const COMMON_TYPOS = {
  'wchc': 'which',
  'wch': 'which',
  'wich': 'which',
  'wht': 'what',
  'wat': 'what',
  'whr': 'where',
  'wher': 'where',
  'hw': 'how',
  'aply': 'apply',
  'aplying': 'applying',
  'aplication': 'application',
  'aplyng': 'applying',
  'admision': 'admission',
  'admisson': 'admission',
  'admisn': 'admission',
  'elgibility': 'eligibility',
  'eligiblity': 'eligibility',
  'elgible': 'eligible',
  'eligble': 'eligible',
  'corse': 'course',
  'corses': 'courses',
  'cors': 'course',
  'cours': 'courses',
  'prgrm': 'program',
  'prgrms': 'programs',
  'programm': 'program',
  'programms': 'programs',
  'feee': 'fees',
  'feez': 'fees',
  'fes': 'fees',
  'scholrship': 'scholarship',
  'scholarshp': 'scholarship',
  'scholorship': 'scholarship',
  'placemnt': 'placement',
  'placemnts': 'placements',
  'plcmnt': 'placement',
  'plcmnts': 'placements',
  'pakage': 'package',
  'packge': 'package',
  'packag': 'package',
  'hosetl': 'hostel',
  'hostal': 'hostel',
  'hostle': 'hostel',
  'libray': 'library',
  'librari': 'library',
  'lib': 'library',
  'timmings': 'timings',
  'timming': 'timing',
  'timngs': 'timings',
  'documnts': 'documents',
  'documnet': 'document',
  'documnets': 'documents',
  'sylabus': 'syllabus',
  'syllbus': 'syllabus',
  'faclty': 'faculty',
  'faculti': 'faculty',
  'cutof': 'cutoff',
  'clg': 'college',
  'collge': 'college',
  'collage': 'college',
  'colledge': 'college',
  'instutute': 'institute',
  'instite': 'institute',
  'cntct': 'contact',
  'numbr': 'number'
};

function expandDomainTerms(text) {
  if (!text || typeof text !== 'string') return text;
  let res = text;
  // Replace known typos
  res = res.replace(/\b([a-zA-Z]+)\b/g, (match) => {
    const lower = match.toLowerCase();
    return COMMON_TYPOS[lower] || match;
  });
  // Expand domain abbreviations for high search recall
  res = res.replace(/\bpg\b/gi, 'PG post graduate (MCA, MMS)');
  res = res.replace(/\bug\b/gi, 'UG under graduate (BCA, BBA, BMS)');
  res = res.replace(/\b(hod|hods|head of department|heads of department)\b/gi, 'HOD Heads of Department (MCA, MMS, BCA, BBA, BMS, Director)');
  res = res.replace(/\b(staff\s*names?|enlist\s*staff|faculty\s*members?|teaching\s*staff|enlist\s*hod\s*names?)\b/gi, 'teaching faculty staff members teachers professors HODs Director');
  res = res.replace(/\b(admission\s*procedure|admission\s*process)\b/gi, 'admission process procedure CET registration CAP rounds eligibility criteria');
  return res;
}

/**
 * Augments user queries with university context and multi-turn conversational topics.
 * Ensures short, conversational, or follow-up questions retrieve high-confidence embeddings
 * while preserving the original query text for prompt display and LLM answering.
 */
function augmentSearchQuery(queryText, history = []) {
  if (!queryText || typeof queryText !== 'string') return queryText;
  const trimmed = queryText.trim();
  const lower = trimmed.toLowerCase();
  const hasUni = UNIVERSITY_SCOPE_REGEX.test(lower);
  const hasCampusIntent = CAMPUS_INTENT_REGEX.test(lower);
  const hasHistory = Array.isArray(history) && history.length > 0;

  // Extract previous topic if this is a genuine follow-up query (and not a topic switch)
  let previousTopic = '';
  if (hasHistory) {
    const hasPronoun = PRONOUN_FOLLOWUP_REGEX.test(lower);
    const hasExplicitTopic = EXPLICIT_TOPIC_REGEX.test(lower);
    // If the query introduces a new explicit topic without pronouns, it is a topic switch
    const isTopicSwitch = hasExplicitTopic && !hasPronoun;
    const isFollowUp = !isTopicSwitch && (hasPronoun || lower.split(/\s+/).length <= 4);

    if (isFollowUp) {
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role === 'user' && history[i].content) {
          const rawPrev = history[i].content.replace(/[?!.]/g, '').trim();
          const cleanPrev = rawPrev
            .replace(/\b(hi|hello|hey|namaste|please|tell me about|can you tell me|what is|what are|how about|give me details about|information on|info about)\b/gi, '')
            .trim();
          if (cleanPrev.length >= 2 && cleanPrev.length <= 80) {
            previousTopic = cleanPrev;
            break;
          }
        }
      }
    }
  }

  let augmented = trimmed;
  if (previousTopic && !lower.includes(previousTopic.toLowerCase())) {
    augmented += ` ${previousTopic}`;
  }

  // Add university context if missing and the query has academic intent or active conversation
  if (!hasUni && (hasCampusIntent || hasHistory)) {
    augmented += ' RCPET IMRD Shirpur';
  }

  return augmented;
}

async function retrieve(queryText, lang = 'en', history = []) {
  try {
    // If query is in Hindi or Marathi, translate search terms to English for optimal vector matching
    let baseKeywords = (lang === 'hi' || lang === 'mr')
      ? await llm.translateQueryToEnglish(queryText)
      : queryText;

    // 1. Immediately normalize common typos & expand abbreviations (e.g. 'wchc' -> 'which', 'pg' -> 'post graduate')
    let normalized = expandDomainTerms(baseKeywords);

    // 2. Proactive AI typo correction for short queries or queries with remaining unrecognized words
    if (baseKeywords.split(/\s+/).length <= 8) {
      try {
        const corrected = await llm.normalizeOrCorrectQuery(baseKeywords);
        if (corrected && corrected.toLowerCase() !== baseKeywords.toLowerCase()) {
          normalized = expandDomainTerms(corrected);
        }
      } catch {}
    }

    // Augment search keywords with university scope & conversation history for vector matching
    const searchKeywords = augmentSearchQuery(normalized, history);

    let queryVec = await llm.getQueryEmbedding(searchKeywords);
    let results = vectorStore.query(queryVec, TOP_K, normalized).filter(r => r.distance <= DISTANCE_THRESHOLD);

    // Fallback: If results are empty or weak, try with original base keywords
    if (!results.length && normalized !== baseKeywords) {
      const fallbackKeywords = augmentSearchQuery(expandDomainTerms(baseKeywords), history);
      const fallbackVec = await llm.getQueryEmbedding(fallbackKeywords);
      const fallbackResults = vectorStore.query(fallbackVec, TOP_K, expandDomainTerms(baseKeywords)).filter(r => r.distance <= DISTANCE_THRESHOLD);
      if (fallbackResults.length) {
        results = fallbackResults;
      }
    }

    if (!results.length) return { found: false, context: '', sources: [] };

    const context = results.map((r, idx) => {
      const m = r.metadata || {};
      const title = m.page_title || m.sheet_name || "RCPET's IMRD Record";
      const section = m.section ? ` | Section: ${m.section}` : '';
      const url = m.url ? ` | URL: ${m.url}` : '';
      const category = m.category ? ` | Category: ${m.category}` : '';
      const header = `[Context ${idx + 1} | Source: ${m.source || 'Unknown'} | ${title}${section}${category}${url}]`;
      return `${header}\n${r.text}\n${'-'.repeat(50)}`;
    }).join('\n\n');

    const sources = results.map(r => ({
      source: r.metadata.source || 'Unknown',
      sheet_name: r.metadata.sheet_name || 'N/A',
      row_id: r.metadata.row_id ?? 'N/A',
      category: r.metadata.category || 'N/A',
      page_title: r.metadata.page_title || '',
      url: r.metadata.url || '',
      distance: Number(r.distance.toFixed(4))
    }));

    return { found: true, context, sources };
  } catch (err) {
    console.error('RAG retrieval error:', err);
    return { found: false, context: '', sources: [] };
  }
}

// In-flight request deduplication map (Singleflight pattern)
// Prevents thundering herds when hundreds/thousands of users ask the same question at once
const inFlightRequests = new Map();

async function answerQuestion(queryText, history = [], preferredLang = 'auto') {
  const lang = llm.detectLanguage(queryText, preferredLang);

  // Fast path for pure greetings in English, Hindi, or Marathi
  if (llm.isPureGreeting(queryText, lang)) {
    return {
      answer: GREETING_ANSWERS[lang] || GREETING_ANSWERS.en,
      sources: [],
      found: true,
      language: lang
    };
  }

  // 1. Multi-tier Cache Lookup (L1 In-Memory RAM -> L2 Distributed Redis)
  const cached = await redisCache.get(queryText, lang, history);
  if (cached && cached.answer) {
    return {
      ...cached,
      cached: true
    };
  }

  // 2. In-flight Request Deduplication:
  // If an identical question is already currently generating, await that exact promise
  const dedupeKey = redisCache.buildCacheKey(queryText, lang, history);
  if (inFlightRequests.has(dedupeKey)) {
    try {
      const coalesced = await inFlightRequests.get(dedupeKey);
      return { ...coalesced, cached: true };
    } catch {}
  }

  const executionPromise = (async () => {
    const retrieval = await retrieve(queryText, lang, history);
    if (!retrieval.found) {
      // Strictly block out-of-the-box or non-university questions
      return {
        answer: OUT_OF_SCOPE_ANSWERS[lang] || OUT_OF_SCOPE_ANSWERS.en,
        sources: [],
        found: false,
        language: lang
      };
    }

    const answer = await llm.generateAnswer(queryText, retrieval.context, history, lang);
    const result = { answer, sources: retrieval.sources, found: true, language: lang };

    // Save answer in L1 In-Memory & L2 Redis cache
    await redisCache.set(queryText, lang, history, result);
    return result;
  })();

  inFlightRequests.set(dedupeKey, executionPromise);
  try {
    return await executionPromise;
  } finally {
    inFlightRequests.delete(dedupeKey);
  }
}

module.exports = { answerQuestion, retrieve, redisCache };
