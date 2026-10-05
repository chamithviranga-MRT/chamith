// Browser stand-in for the Node global the shared code reads (config.ts reads process.env).
globalThis.process = globalThis.process || { env: {} };
