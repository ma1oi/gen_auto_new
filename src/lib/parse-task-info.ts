export const GEO_TO_LANG: Record<string, string> = {
  GB: "en", AU: "en", CA: "en", IE: "en", NZ: "en", ZA: "en", SG: "en", HK: "en",
  DE: "de", AT: "de", CH: "de",
  FR: "fr", BE: "fr",
  ES: "es", AR: "es", CL: "es", MX: "es", PE: "es", UY: "es", CO: "es", VE: "es",
  EC: "es", GT: "es", CU: "es", DO: "es", HN: "es", PY: "es", SV: "es", NI: "es",
  CR: "es", PA: "es", BO: "es", PR: "es",
  RU: "ru", KZ: "ru", KG: "ru",
  IT: "it", PT: "pt", BR: "pt", NL: "nl", PL: "pl", RO: "ro", TR: "tr",
  CZ: "cs", SK: "cs", HU: "hu", BG: "bg", HR: "hr", RS: "sr", SI: "sl",
  GR: "el", CY: "el",
  SE: "sv", FI: "fi", NO: "no", DK: "da", EE: "et", LV: "lv", LT: "lt",
  IL: "he", EG: "ar", TN: "ar", AM: "ar",
  IN: "hi", JP: "ja", KR: "ko", VN: "vi", UA: "uk", GE: "ka", MY: "ms", ID: "id",
  SC: "en", SH: "en",
};

const LANG_NAME_TO_ISO: Record<string, string> = {
  английский: "en", немецкий: "de", французский: "fr", испанский: "es",
  итальянский: "it", русский: "ru", нидерландский: "nl", голландский: "nl",
  польский: "pl", румынский: "ro", турецкий: "tr", чешский: "cs",
  венгерский: "hu", болгарский: "bg", хорватский: "hr", сербский: "sr",
  словенский: "sl", греческий: "el", шведский: "sv", финский: "fi",
  норвежский: "no", эстонский: "et", латышский: "lv", литовский: "lt",
  иврит: "he", арабский: "ar", хинди: "hi", японский: "ja",
  корейский: "ko", вьетнамский: "vi", украинский: "uk", грузинский: "ka",
  малайский: "ms", индонезийский: "id", португальский: "pt",
};

export interface ParsedTaskInfo {
  topic: string;
  domain: string;
  geo: string;
  brandName: string;
  langOverride: string;
  deployType: "csv" | "ip";
  serverIp: string | null;
}

export function parseTaskInfo(data: Record<string, unknown>): ParsedTaskInfo {
  const tabs = data.tabs as Record<string, unknown> | undefined;
  const defaultTabs = (tabs?.defaultTabs as unknown[]) ?? [];
  const tab0 = defaultTabs[0] as Record<string, unknown> | undefined;
  const fields = (tab0?.fields as unknown[]) ?? [];
  const summaryField = (fields as { id: string; text?: string }[]).find((f) => f.id === "summary");
  const originalSummary = summaryField?.text ?? "";
  let topic = originalSummary.replace(/^\s*\|\s*/, "").trim();
  const summaryTematika = topic.match(/тематика\s*[:\-–—]?\s*(.+)/i);
  if (summaryTematika) topic = summaryTematika[1].trim();

  const tab1 = defaultTabs[1] as Record<string, unknown> | undefined;
  const editableFields = (tab1?.inlineEditableFields as { id: string; editHtml?: string }[]) ?? [];

  const domainField = editableFields.find((f) => f.id === "customfield_14608");
  const domainMatch = domainField?.editHtml?.match(/id="customfield_14608"[^>]*value="([^"]+)"/);
  let domain = domainMatch?.[1] ?? "";

  const descField = editableFields.find((f) => f.id === "description");
  const descMatch = descField?.editHtml?.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/);
  const descText = descMatch?.[1] ?? "";

  const VALID_DOMAIN = /^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i;
  const SKIP_DOMAINS = /^(jira\.|whitegen\.|lucky-team\.|fonts\.|cdnjs\.|unpkg\.)/i;
  if (!domain || !VALID_DOMAIN.test(domain.trim())) {
    const domainFromDesc = descText.match(/\[([a-z0-9][a-z0-9.-]+\.[a-z]{2,})\|http/i)
      ?? descText.match(/\|([a-z0-9][a-z0-9.-]+\.[a-z]{2,})\|/i)
      ?? descText.match(/купить\s+домен\s+([a-z0-9][a-z0-9.-]+\.[a-z]{2,})/i)
      ?? descText.match(/вайт[еа]?\s+([a-z0-9][a-z0-9.-]+\.[a-z]{2,})/i)
      ?? descText.match(/домен[еа]?\s+(?:\S+\s+){0,8}([a-z0-9][a-z0-9.-]+\.[a-z]{2,})/i);
    domain = domainFromDesc?.[1] ?? "";
  }
  if (!domain) {
    const allDomains = [...descText.matchAll(/\b([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|de|co\.uk|fr|es|it|nl|pl|ro|ru|uk|ch|at|be|au|ca|nz|info|biz|online|site|store|shop))\b/gi)];
    const found = allDomains.map((m) => m[1]).find((d) => !SKIP_DOMAINS.test(d));
    if (found) domain = found;
  }

  if (!domain) {
    const firstLine = (descText.split(/\r?\n/)[0] ?? "").trim();
    const m = firstLine.match(/^([a-z0-9][a-z0-9.-]+\.[a-z]{2,})\s+[\d.]+/i);
    if (m) domain = m[1];
  }

  const normalizedDesc = descText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const topicFromWhite = normalizedDesc.match(/тематика\s+вайта\s*[-–—:]\s*(.+)/i);
  const topicFromDesc = normalizedDesc.match(/тематик[уа]\s*[-–—:]\s*(.+)/i);
  const topicFromKeyword = normalizedDesc.match(/тематика\s+(?!вайта)(.{10,})/i);

  // A content line can start with a language declaration attached to the
  // actual topic, e.g. "Язык английский. Городские рынки Претории: ...".
  // Strip that prefix before noise-checking the line, otherwise HARD_NOISE's
  // "язык"/"английск" entries discard the whole line (and with it the topic).
  const stripLangPrefix = (line: string): { lang: string; rest: string } => {
    const m = line.match(/^\s*(?:язык\s+)?([a-zа-яё]+)\s*[.:\-–—]\s*(.*)$/i);
    if (m && LANG_NAME_TO_ISO[m[1].toLowerCase()]) {
      return { lang: LANG_NAME_TO_ISO[m[1].toLowerCase()], rest: m[2].trim() };
    }
    return { lang: "", rest: line };
  };

  const HARD_NOISE = /^(сервер|server|\d{1,3}\.\d{1,3}|взять|купить|нужно|необходимо|регистратор|новый\s+домен|домен|апрув|approva|seo|язык|english|английск|[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(\s|$))/i;
  const SKIP_LINE = /^[{|*]/;
  const opisanieMatch = normalizedDesc.match(/(?:\{\*\}|\*)?Описание(?:\{\*\}|\*)?\s*:\s*([\s\S]+)/i);
  const contentSection = opisanieMatch ? opisanieMatch[1] : normalizedDesc;
  const allLines = contentSection.split("\n").map((l) => l.trim()).filter(Boolean);
  const topicLines: string[] = [];
  let langOverrideFromLine = "";
  for (const line of allLines) {
    const { lang, rest } = stripLangPrefix(line);
    const candidate = lang ? rest : line;
    if (HARD_NOISE.test(candidate)) break;
    if (SKIP_LINE.test(candidate)) { if (topicLines.length > 0) break; continue; }
    if (lang && !langOverrideFromLine) langOverrideFromLine = lang;
    topicLines.push(candidate);
  }
  const firstSentence = topicLines.join(" ").trim();

  const topicAfterServer = (() => {
    const m = normalizedDesc.match(/Сервер[^\n]*\n+([\s\S]+)/i);
    if (!m) return "";
    const lines = m[1].split("\n").map((l) => l.trim()).filter(Boolean);
    return lines.map((l) => stripLangPrefix(l).rest).find((l) => !HARD_NOISE.test(l) && !SKIP_LINE.test(l) && l.length > 15) ?? "";
  })();

  const topicAfterRegistrator = (() => {
    const m = normalizedDesc.match(/Регистратор[^\n]*\n+([\s\S]+)/i);
    if (!m) return "";
    const lines = m[1].split("\n").map((l) => l.trim()).filter(Boolean);
    return lines.map((l) => stripLangPrefix(l).rest).find((l) => !HARD_NOISE.test(l) && !SKIP_LINE.test(l) && l.length > 15) ?? "";
  })();

  const isNewFormat = /(?:^|\n)4\.\s+Язык/i.test(normalizedDesc);
  if (isNewFormat) {
    const p2 = normalizedDesc.match(/(?:^|\n)2\.\s+([\s\S]+?)(?=\n\d+\.|$)/);
    const p3 = normalizedDesc.match(/(?:^|\n)3\.\s+([\s\S]+?)(?=\n\d+\.|$)/);
    const theme = p2?.[1].replace(/\n/g, " ").trim() ?? "";
    const cityLine = p3?.[1].replace(/\n/g, " ").trim() ?? "";
    topic = [theme, cityLine].filter(Boolean).join(". ");
  } else if (topicFromWhite) {
    topic = topicFromWhite[1].trim();
  } else if (topicFromDesc) {
    topic = topicFromDesc[1].trim();
  } else if (topicFromKeyword) {
    topic = topicFromKeyword[1].trim();
  } else if (topicAfterRegistrator) {
    topic = topicAfterRegistrator;
  } else if (firstSentence.length > 10 || (/тютюнов/i.test(originalSummary) && firstSentence.length > 0)) {
    topic = firstSentence;
  } else if (topicAfterServer) {
    topic = topicAfterServer;
  } else if (/гео/i.test(topic) || /^[A-Za-z]{2,3}-\d+$/.test(topic)) {
    topic = "";
  }

  topic = topic.replace(/[.\s]*сервер[\s\S]*/i, "").replace(/[.,;—–\s]+$/, "").trim();

  const brandMatch = normalizedDesc.match(/^([A-Z][A-Za-z0-9]+)\s*[-–—]\s*добавить/im);
  const brandName = brandMatch?.[1] ?? "";
  if (brandName && !topic.includes(brandName)) {
    topic = topic ? `${topic}. ${brandName}` : brandName;
  }

  const opisanieExtracted = normalizedDesc.match(/Описание\s*:\s*([\s\S]+?)(?=\n\s*(?:Город|Язык|Сервер|\d+\.)|$)/i)?.[1]?.replace(/\n/g, " ").trim() ?? "";
  const gorodExtracted = normalizedDesc.match(/Город\s*:\s*(.+)/i)?.[1]?.trim() ?? "";
  if (opisanieExtracted && !topic.includes(opisanieExtracted.substring(0, 20))) {
    topic = topic ? `${topic}\nОписание: ${opisanieExtracted}` : `Описание: ${opisanieExtracted}`;
  }
  if (gorodExtracted) {
    topic = topic ? `${topic}\nГород: ${gorodExtracted}` : `Город: ${gorodExtracted}`;
  }

  const geoField = editableFields.find((f) => f.id === "customfield_14602");
  const geoMatch = geoField?.editHtml?.match(/selected="selected"[^>]*>\s*([^<\s][^<]*?)\s*<\/option>/);
  const geo = geoMatch?.[1]?.trim() ?? "";

  const IP_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
  topic = topic
    .split("\n")
    .map((line) => line.replace(IP_RE, "").replace(/\s{2,}/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  let langOverride = langOverrideFromLine;
  const langPrefixMatch = topic.match(/^\s*([a-zа-яё]+)\s*[.:\-–—]\s*/i);
  if (langPrefixMatch && LANG_NAME_TO_ISO[langPrefixMatch[1].toLowerCase()]) {
    langOverride = LANG_NAME_TO_ISO[langPrefixMatch[1].toLowerCase()];
    topic = topic.slice(langPrefixMatch[0].length).trim();
  }

  const ipMatch = descText.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  const deployType: "csv" | "ip" = ipMatch ? "ip" : "csv";
  const serverIp = ipMatch ? ipMatch[0] : null;

  return { topic, domain: domain.toLowerCase(), geo, brandName, langOverride, deployType, serverIp };
}
