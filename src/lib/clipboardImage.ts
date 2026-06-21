export interface ClipboardImageItem {
  type: string;
  getAsFile: () => File | null;
}

export function imageFileFromClipboardItems(items: ArrayLike<ClipboardImageItem> | Iterable<ClipboardImageItem>) {
  for (const item of Array.from(items)) {
    if (item.type.startsWith("image/")) {
      return item.getAsFile() ?? undefined;
    }
  }

  return undefined;
}
