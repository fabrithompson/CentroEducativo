const ts = () => new Date().toISOString();

export const logger = {
  info: (msg: string, meta?: unknown) =>
    console.log(`[${ts()}] INFO  ${msg}`, meta ?? ''),
  warn: (msg: string, meta?: unknown) =>
    console.warn(`[${ts()}] WARN  ${msg}`, meta ?? ''),
  error: (msg: string, meta?: unknown) =>
    console.error(`[${ts()}] ERROR ${msg}`, meta ?? ''),
  debug: (msg: string, meta?: unknown) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[${ts()}] DEBUG ${msg}`, meta ?? '');
    }
  },
};
