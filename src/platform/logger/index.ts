export const log = {
  info: (...a: unknown[]) => console.log('[info]', ...a),
  error: (...a: unknown[]) => console.error('[error]', ...a)
};