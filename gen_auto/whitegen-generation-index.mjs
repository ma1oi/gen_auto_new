export async function loadGenerationIndex(numbers, fetchPage, perPage = 100, maxPages = 25) {
  const pending = new Set(numbers);
  const found = new Map();
  let page = 1;

  while (pending.size > 0 && page <= maxPages) {
    const items = await fetchPage(page, perPage);
    for (const item of items) {
      if (!pending.has(item.number)) continue;
      found.set(item.number, item);
      pending.delete(item.number);
    }
    if (items.length === 0) break;
    page++;
  }

  return found;
}
