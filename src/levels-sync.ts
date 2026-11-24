/**
 * Running locally: this page, so that when the pack editor saves the packs, every other open page
 * (on a phone, say) reloads with them, but not the page that saved them (see
 * scripts/levels-writer.mjs).
 */
export const pageId = Math.random().toString(36).slice(2);
if (import.meta.hot) import.meta.hot.on('levels:saved', (d: { by: string }) => d.by !== pageId && location.reload());
