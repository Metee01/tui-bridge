import js from "@eslint/js";

const nodeGlobals = {
  console: "readonly",
  process: "readonly",
  Buffer: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  setImmediate: "readonly",
  clearImmediate: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  TextDecoder: "readonly",
  TextEncoder: "readonly",
  queueMicrotask: "readonly",
  AbortController: "readonly",
  fetch: "readonly",
  Request: "readonly",
  Response: "readonly",
  Headers: "readonly",
};

const browserGlobals = {
  window: "readonly",
  document: "readonly",
  WebSocket: "readonly",
  ResizeObserver: "readonly",
  crypto: "readonly",
  sessionStorage: "readonly",
  localStorage: "readonly",
  location: "readonly",
  navigator: "readonly",
  HTMLElement: "readonly",
  HTMLDivElement: "readonly",
  customElements: "readonly",
};

export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "graphify-out/**",
      "**/*.ts",
      "**/*.tsx",
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...nodeGlobals, ...browserGlobals },
    },
  },
];