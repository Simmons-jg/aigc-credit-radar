export interface BrowserCreditParseResult {
  creditsRemaining: number;
  creditsTotal?: number;
  currencyLabel: string;
  matchedText: string;
}

const labelBeforeNumberPatterns = [
  /\b(?:current\s+balance|credits?\s+balance|tokens?\s+remaining|remaining\s+tokens?|available\s+credits?|available\s+tokens?|balance)\b[^0-9]{0,48}([0-9][0-9,]*(?:\.\d+)?)/i,
  /(?:当前余额|可用积分|剩余积分|积分余额|可用点数|剩余点数|余额)[^0-9]{0,48}([0-9][0-9,]*(?:\.\d+)?)/i,
];

const numberBeforeUnitPatterns = [
  /([0-9][0-9,]*(?:\.\d+)?)\s*(credits?|tokens?)\b/i,
  /([0-9][0-9,]*(?:\.\d+)?)\s*(积分|点数|点)\b/i,
];

const marketingTextPatterns = [
  /\b(?:starter|pro|enterprise|pricing|monthly\s+credits|plan\s+includes)\b/i,
  /(?:定价|套餐|每月积分|包含积分)/i,
];

const standaloneNumberPattern = /(^|[^\d.])([0-9][0-9,]*(?:\.\d+)?)(?![\d.])/g;
const shortOcrTextLimit = 160;
const maxLikelyCreditBalance = 200_000;

export function parseBrowserCreditText(raw: string): BrowserCreditParseResult | undefined {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;

  for (const pattern of labelBeforeNumberPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      return {
        creditsRemaining: normalizeAmount(match[1]),
        currencyLabel: inferCurrencyLabel(match[0]),
        matchedText: match[0],
      };
    }
  }

  for (const pattern of numberBeforeUnitPatterns) {
    const match = normalized.match(pattern);
    if (match && !looksLikeMarketingPlan(normalized, match.index ?? 0)) {
      return {
        creditsRemaining: normalizeAmount(match[1]),
        currencyLabel: inferCurrencyLabel(match[2]),
        matchedText: match[0],
      };
    }
  }

  const standaloneBalance = parseStandaloneOcrBalance(normalized);
  if (standaloneBalance) return standaloneBalance;

  return undefined;
}

function normalizeAmount(value: string) {
  return Number(value.replace(/,/g, ""));
}

function inferCurrencyLabel(value: string) {
  return /token/i.test(value) ? "tokens" : "credits";
}

function looksLikeMarketingPlan(text: string, matchIndex: number) {
  const window = text.slice(Math.max(0, matchIndex - 80), matchIndex + 120);
  return marketingTextPatterns.some((pattern) => pattern.test(window));
}

function parseStandaloneOcrBalance(text: string): BrowserCreditParseResult | undefined {
  if (text.length > shortOcrTextLimit || looksLikeMarketingPlan(text, 0)) return undefined;

  const matches = [...text.matchAll(standaloneNumberPattern)];
  if (matches.length === 0) return undefined;
  if (matches.length > 1 && looksLikeExplicitRatio(text)) return undefined;

  const candidates = matches
    .map((match) => ({
      match,
      amount: normalizeAmount(match[2]),
    }))
    .filter((candidate) => candidate.amount > 0 && candidate.amount <= maxLikelyCreditBalance);
  if (candidates.length === 0) return undefined;

  const candidate = candidates.length === 1 ? candidates[0] : candidates.at(-1);
  if (!candidate) return undefined;

  return {
    creditsRemaining: candidate.amount,
    currencyLabel: inferCurrencyLabel(text),
    matchedText: candidate.match[0].trim(),
  };
}

function looksLikeExplicitRatio(text: string) {
  return /\d[\d,]*(?:\.\d+)?\s*(?:\/|of|out\s+of)\s*\d[\d,]*(?:\.\d+)?/i.test(text);
}
