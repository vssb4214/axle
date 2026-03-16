import axios from 'axios';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const EXTRACTION_MODEL = process.env.OLLAMA_EXTRACTION_MODEL || 'qwen2.5:latest';
const REASONING_MODEL = process.env.OLLAMA_REASONING_MODEL || 'llama3.1:latest';

type OllamaChatRequest = {
  model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  stream?: boolean;
};

export async function ollamaChatJSON<T>(input: {
  model: 'extraction' | 'reasoning';
  systemPrompt: string;
  userPrompt: string;
}): Promise<T> {
  const modelName = input.model === 'extraction' ? EXTRACTION_MODEL : REASONING_MODEL;

  const body: OllamaChatRequest = {
    model: modelName,
    stream: false,
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.userPrompt }
    ]
  };

  const res = await axios.post(`${OLLAMA_BASE_URL}/v1/chat/completions`, body, {
    timeout: 60000
  });

  const content = res.data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No content from Ollama');
  }

  try {
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    const json = content.slice(jsonStart, jsonEnd + 1);
    return JSON.parse(json) as T;
  } catch (err) {
    throw new Error('Failed to parse JSON from Ollama response');
  }
}

export async function ollamaExplainText(input: {
  title: string;
  valuation: { value_low: number; value_mid: number; value_high: number; confidence: number };
  compsSummary: string;
}): Promise<{ summary: string; bullets: string[]; warnings: string[] }> {
  type Resp = { summary: string; bullets: string[]; warnings: string[] };

  const systemPrompt = `
You are an honest, conservative car valuation assistant. 
You NEVER invent numeric prices; you only explain the provided valuation and its uncertainty in plain English.
Always highlight weaknesses in the data and avoid overconfidence.
Respond strictly as compact JSON with: summary (string), bullets (string[]), warnings (string[]).
`;

  const userPrompt = `
Listing: ${input.title}
Valuation range: ${input.valuation.value_low}–${input.valuation.value_high} (mid ${input.valuation.value_mid})
Confidence: ${input.valuation.confidence}

Comparable data summary:
${input.compsSummary}
`;

  return ollamaChatJSON<Resp>({ model: 'reasoning', systemPrompt, userPrompt });
}

