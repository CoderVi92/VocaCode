// Poin 3: Dukungan Berbagai Model AI Modern
// Konfigurasi lengkap dengan metadata spesifikasi batas limit tipe dukungan MIME & Pikiran
// Kode ini diadopsi utuh dari server.cjs khusus untuk melengkapi UI di mode BASIC VocaCode

export interface BasicModelConfig {
    id: string;
    label: string;
    limit: { context: number; output: number };
    apiProvider: string;
    modelProvider: string;
    supportsThinking: boolean;
    thinkingBudget: number;
    minThinkingBudget: number;
    supportsImages: boolean;
    supportsVideo: boolean;
    tagTitle?: string;
    mediaCategories: string[];
    supportedMimeTypes: string[];
}

export const BASIC_MODELS: BasicModelConfig[] = [
  {
    id: "gemini-3.1-pro-high", label: "Gemini 3.1 Pro (High)", limit: { context: 1048576, output: 65535 },
    apiProvider: "API_PROVIDER_GOOGLE_GEMINI", modelProvider: "MODEL_PROVIDER_GOOGLE",
    supportsThinking: true, thinkingBudget: 10001, minThinkingBudget: 128,
    supportsImages: true, supportsVideo: true, tagTitle: "New",
    mediaCategories: ["PDF", "Gambar", "Video", "Audio", "Kode", "Dokumen"],
    supportedMimeTypes: ["image/heic","application/x-python-code","text/x-typescript","video/webm","application/rtf","image/png","text/xml","text/javascript","video/jpeg2000","video/mp4","text/markdown","application/x-javascript","video/text/timestamp","audio/webm;codecs=opus","video/audio/wav","text/csv","image/heif","image/jpeg","text/html","text/css","text/plain","application/x-ipynb+json","application/x-typescript","application/pdf","video/videoframe/jpeg2000","image/webp","video/audio/s16le","text/rtf","text/x-python","application/json","text/x-python-script"]
  },
  {
    id: "gemini-3.1-pro-low", label: "Gemini 3.1 Pro (Low)", limit: { context: 1048576, output: 65535 },
    apiProvider: "API_PROVIDER_GOOGLE_GEMINI", modelProvider: "MODEL_PROVIDER_GOOGLE",
    supportsThinking: true, thinkingBudget: 1001, minThinkingBudget: 128,
    supportsImages: true, supportsVideo: true, tagTitle: "New",
    mediaCategories: ["PDF", "Gambar", "Video", "Audio", "Kode", "Dokumen"],
    supportedMimeTypes: ["image/heic","application/x-python-code","text/x-typescript","video/webm","application/rtf","image/png","text/xml","text/javascript","video/jpeg2000","video/mp4","text/markdown","application/x-javascript","video/text/timestamp","audio/webm;codecs=opus","video/audio/wav","text/csv","image/heif","image/jpeg","text/html","text/css","text/plain","application/x-ipynb+json","application/x-typescript","application/pdf","video/videoframe/jpeg2000","image/webp","video/audio/s16le","text/rtf","text/x-python","application/json","text/x-python-script"]
  },
  {
    id: "gemini-3-flash-agent", label: "Gemini 3 Flash", limit: { context: 1048576, output: 65536 },
    apiProvider: "API_PROVIDER_GOOGLE_GEMINI", modelProvider: "MODEL_PROVIDER_GOOGLE",
    supportsThinking: true, thinkingBudget: -1, minThinkingBudget: 32,
    supportsImages: true, supportsVideo: true,
    mediaCategories: ["PDF", "Gambar", "Video", "Audio", "Kode", "Dokumen"],
    supportedMimeTypes: ["application/x-python-code","video/videoframe/jpeg2000","video/audio/wav","application/json","video/audio/s16le","audio/webm;codecs=opus","text/rtf","application/pdf","text/css","application/x-ipynb+json","text/html","image/png","text/csv","text/javascript","text/x-typescript","text/x-python-script","text/x-python","video/mp4","text/markdown","image/heic","image/jpeg","application/x-javascript","image/heif","application/rtf","image/webp","application/x-typescript","video/jpeg2000","text/plain","text/xml","video/text/timestamp","video/webm"]
  },
  {
    id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Thinking)", limit: { context: 250000, output: 64000 },
    apiProvider: "API_PROVIDER_ANTHROPIC_VERTEX", modelProvider: "MODEL_PROVIDER_ANTHROPIC",
    supportsThinking: true, thinkingBudget: 1024, minThinkingBudget: 1024,
    supportsImages: true, supportsVideo: false,
    mediaCategories: ["Gambar", "Video Frame"],
    supportedMimeTypes: ["image/png","image/webp","video/jpeg2000","video/videoframe/jpeg2000","image/heic","image/heif","image/jpeg"]
  },
  {
    id: "claude-opus-4-6-thinking", label: "Claude Opus 4.6 (Thinking)", limit: { context: 250000, output: 64000 },
    apiProvider: "API_PROVIDER_ANTHROPIC_VERTEX", modelProvider: "MODEL_PROVIDER_ANTHROPIC",
    supportsThinking: true, thinkingBudget: 1024, minThinkingBudget: 1024,
    supportsImages: true, supportsVideo: false,
    mediaCategories: ["Gambar", "Video Frame"],
    supportedMimeTypes: ["image/png","image/webp","video/jpeg2000","video/videoframe/jpeg2000","image/heic","image/heif","image/jpeg"]
  },
  {
    id: "gpt-oss-120b-medium", label: "GPT-OSS 120B (Medium)", limit: { context: 114000, output: 32768 },
    apiProvider: "API_PROVIDER_OPENAI_VERTEX", modelProvider: "MODEL_PROVIDER_OPENAI",
    supportsThinking: true, thinkingBudget: 8192, minThinkingBudget: 1024,
    supportsImages: false, supportsVideo: false,
    mediaCategories: [],
    supportedMimeTypes: []
  },
];
