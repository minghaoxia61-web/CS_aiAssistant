export const DATA_CHANGED_EVENT = 'cs-assistant:data-changed'

export function notifyLearningDataChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT))
  }
}
