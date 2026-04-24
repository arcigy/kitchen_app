export type WritableHandle = {
  createWritable: () => Promise<{
    write: (data: string | Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

type SavePickerOptions = {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
};

type PickerWindow = Window &
  typeof globalThis & {
    showSaveFilePicker?: (options?: SavePickerOptions) => Promise<WritableHandle>;
  };

export async function saveTextFile(
  text: string,
  suggestedName: string,
  handle?: WritableHandle | null,
  mimeType = "application/json"
): Promise<WritableHandle | null> {
  if (handle) {
    await writeHandle(handle, new Blob([text], { type: `${mimeType};charset=utf-8` }));
    return handle;
  }
  return saveTextFileAs(text, suggestedName, mimeType);
}

export async function saveTextFileAs(
  text: string,
  suggestedName: string,
  mimeType = "application/json"
): Promise<WritableHandle | null> {
  const picker = (window as PickerWindow).showSaveFilePicker;
  if (typeof picker === "function") {
    const extension = suggestedName.includes(".") ? suggestedName.slice(suggestedName.lastIndexOf(".")) : ".json";
    const handle = await picker({
      suggestedName,
      types: [
        {
          description: mimeType,
          accept: {
            [mimeType]: [extension]
          }
        }
      ]
    });
    await writeHandle(handle, new Blob([text], { type: `${mimeType};charset=utf-8` }));
    return handle;
  }

  downloadTextFile(suggestedName, text, mimeType);
  return null;
}

export function downloadTextFile(name: string, text: string, mimeType = "application/json"): void {
  downloadBlob(name, new Blob([text], { type: `${mimeType};charset=utf-8` }));
}

export function downloadCanvasPng(canvas: HTMLCanvasElement, name: string): void {
  const url = canvas.toDataURL("image/png");
  triggerDownload(name, url);
}

function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  triggerDownload(name, url, () => URL.revokeObjectURL(url));
}

function triggerDownload(name: string, url: string, cleanup?: () => void): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  cleanup?.();
}

async function writeHandle(handle: WritableHandle, data: string | Blob): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}
