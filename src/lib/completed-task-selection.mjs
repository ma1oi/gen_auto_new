export function getCompletedKeysInSelection(currentKeys, completedKeys) {
  const completed = new Set(completedKeys.map((key) => key.toUpperCase()));
  return currentKeys.filter((key) => completed.has(key.toUpperCase()));
}
