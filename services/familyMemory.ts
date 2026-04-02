import { GoogleGenAI } from '@google/genai';

const FAMILY_MEMORY_EMBED_MODEL = 'gemini-embedding-001';
const FAMILY_MEMORY_OUTPUT_DIMENSION = 768;

export type FamilyMemoryEntry = {
  id: string;
  createdAt: number;
  userText: string;
  assistantText: string;
  combinedText: string;
  embedding: number[];
};

type MemorySearchResult = {
  entry: FamilyMemoryEntry;
  score: number;
};

const aiClientCache = new Map<string, GoogleGenAI>();

const getAiClient = (apiKey: string) => {
  const cached = aiClientCache.get(apiKey);
  if (cached) return cached;
  const client = new GoogleGenAI({ apiKey });
  aiClientCache.set(apiKey, client);
  return client;
};

const cleanText = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();

const extractEmbeddingValues = (response: any) => {
  const embeddings = Array.isArray(response?.embeddings) ? response.embeddings : [];
  const first = embeddings[0];
  const values = Array.isArray(first?.values) ? first.values : [];
  return values
    .map((value: unknown) => Number(value))
    .filter((value: number) => Number.isFinite(value));
};

const cosineSimilarity = (left: number[], right: number[]) => {
  if (!left.length || !right.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < left.length; i += 1) {
    dot += left[i] * right[i];
    leftNorm += left[i] * left[i];
    rightNorm += right[i] * right[i];
  }
  if (!leftNorm || !rightNorm) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
};

export const buildFamilyMemoryCombinedText = (userText: unknown, assistantText: unknown) => {
  const user = cleanText(userText);
  const assistant = cleanText(assistantText);
  if (!user && !assistant) return '';
  if (user && assistant) {
    return `User said: ${user}\nAiro replied: ${assistant}`;
  }
  if (user) {
    return `User said: ${user}`;
  }
  return `Airo replied: ${assistant}`;
};

export const normalizeFamilyMemoryEntry = (value: unknown): FamilyMemoryEntry | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const combinedText = cleanText(raw.combinedText);
  const userText = cleanText(raw.userText);
  const assistantText = cleanText(raw.assistantText);
  const embedding = Array.isArray(raw.embedding)
    ? raw.embedding.map((item) => Number(item)).filter((item) => Number.isFinite(item))
    : [];
  if (!combinedText || !embedding.length) return null;
  return {
    id: cleanText(raw.id) || `memory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now(),
    userText,
    assistantText,
    combinedText,
    embedding,
  };
};

export const normalizeFamilyMemoryEntries = (value: unknown) => {
  if (!Array.isArray(value)) return [] as FamilyMemoryEntry[];
  return value
    .map((entry) => normalizeFamilyMemoryEntry(entry))
    .filter((entry): entry is FamilyMemoryEntry => Boolean(entry));
};

export const mergeFamilyMemoryEntries = (...groups: Array<FamilyMemoryEntry[] | undefined | null>) => {
  const merged = new Map<string, FamilyMemoryEntry>();
  const byContent = new Map<string, FamilyMemoryEntry>();
  for (const group of groups) {
    for (const entry of group || []) {
      if (!entry?.combinedText || !entry.embedding?.length) continue;
      const contentKey = entry.combinedText.trim().toLowerCase();
      const existingById = merged.get(entry.id);
      const existingByContent = byContent.get(contentKey);
      const winner =
        existingById && existingById.createdAt >= entry.createdAt
          ? existingById
          : existingByContent && existingByContent.createdAt >= entry.createdAt
            ? existingByContent
            : entry;
      merged.set(winner.id, winner);
      byContent.set(contentKey, winner);
    }
  }
  return Array.from(merged.values()).sort((left, right) => left.createdAt - right.createdAt);
};

export const createFamilyMemoryEntry = async (
  apiKey: string,
  payload: { userText?: unknown; assistantText?: unknown; createdAt?: number }
) => {
  const combinedText = buildFamilyMemoryCombinedText(payload.userText, payload.assistantText);
  if (!combinedText) return null;
  const ai = getAiClient(apiKey);
  const response = await ai.models.embedContent({
    model: FAMILY_MEMORY_EMBED_MODEL,
    contents: combinedText,
    config: {
      outputDimensionality: FAMILY_MEMORY_OUTPUT_DIMENSION,
    },
  });
  const embedding = extractEmbeddingValues(response);
  if (!embedding.length) {
    throw new Error('Family memory embedding returned no values');
  }
  return {
    id: `memory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Number.isFinite(Number(payload.createdAt)) ? Number(payload.createdAt) : Date.now(),
    userText: cleanText(payload.userText),
    assistantText: cleanText(payload.assistantText),
    combinedText,
    embedding,
  } as FamilyMemoryEntry;
};

export const searchFamilyMemories = async (
  apiKey: string,
  query: string,
  memories: FamilyMemoryEntry[],
  options: { limit?: number; minimumScore?: number } = {}
) => {
  const cleanedQuery = cleanText(query);
  const normalizedMemories = normalizeFamilyMemoryEntries(memories);
  if (!cleanedQuery || !normalizedMemories.length) return [] as MemorySearchResult[];
  const ai = getAiClient(apiKey);
  const response = await ai.models.embedContent({
    model: FAMILY_MEMORY_EMBED_MODEL,
    contents: cleanedQuery,
    config: {
      outputDimensionality: FAMILY_MEMORY_OUTPUT_DIMENSION,
    },
  });
  const queryEmbedding = extractEmbeddingValues(response);
  if (!queryEmbedding.length) return [] as MemorySearchResult[];
  const minimumScore = Number.isFinite(Number(options.minimumScore)) ? Number(options.minimumScore) : 0.2;
  const limit = Math.max(1, Math.min(6, Number(options.limit) || 4));

  return normalizedMemories
    .map((entry) => ({
      entry,
      score: cosineSimilarity(queryEmbedding, entry.embedding),
    }))
    .filter((item) => Number.isFinite(item.score) && item.score >= minimumScore)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return right.entry.createdAt - left.entry.createdAt;
    })
    .slice(0, limit);
};

export const formatRelevantFamilyMemories = (
  name: string,
  results: Array<{ entry: FamilyMemoryEntry; score: number }>
) => {
  if (!results.length) return '';
  const lines = results.map(({ entry }) => {
    const when = new Date(entry.createdAt).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    return `- ${when}: ${entry.combinedText}`;
  });
  return [
    `Relevant memories about ${name}:`,
    ...lines,
    'Use these only when they actually help personalize your reply, and do not mention memory retrieval unless the user asks.',
  ].join('\n');
};
