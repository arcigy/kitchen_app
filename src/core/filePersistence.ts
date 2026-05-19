import { sanitizeStorageFileName, type ClientProjectPhaseScope } from "./storage/storage-types";

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

type ScopedTextFileArgs = {
  text: string;
  scope: ClientProjectPhaseScope;
  prefix: string;
  extension: string;
  handle?: WritableHandle | null;
  mimeType?: string;
};

type ScopedCanvasPngArgs = {
  canvas: HTMLCanvasElement;
  scope: ClientProjectPhaseScope;
  prefix: string;
};

function buildScopedFileName(scope: ClientProjectPhaseScope, prefix: string, extension: string): string {
  const timestamp = new Date().toISOString().replaceAll(":", "").slice(0, 15);
  return sanitizeStorageFileName(`${scope.clientId}__${scope.projectId}__${scope.phaseId}__${prefix}-${timestamp}.${extension}`);
}

export async function saveTextFile(
  args: ScopedTextFileArgs
): Promise<WritableHandle | null> {
  const suggestedName = buildScopedFileName(args.scope, args.prefix, args.extension);
  const mimeType = args.mimeType ?? "application/json";
  if (args.handle) {
    await writeHandle(args.handle, new Blob([args.text], { type: `${mimeType};charset=utf-8` }));
    return args.handle;
  }
  return saveTextFileAs({ ...args, mimeType });
}

export async function saveTextFileAs(
  args: Omit<ScopedTextFileArgs, "handle">
): Promise<WritableHandle | null> {
  const suggestedName = buildScopedFileName(args.scope, args.prefix, args.extension);
  const mimeType = args.mimeType ?? "application/json";
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
    await writeHandle(handle, new Blob([args.text], { type: `${mimeType};charset=utf-8` }));
    return handle;
  }

  downloadTextFile(suggestedName, args.text, mimeType);
  return null;
}

export function downloadTextFile(name: string, text: string, mimeType = "application/json"): void {
  downloadBlob(name, new Blob([text], { type: `${mimeType};charset=utf-8` }));
}

export function downloadCanvasPng(args: ScopedCanvasPngArgs): void {
  const url = args.canvas.toDataURL("image/png");
  triggerDownload(buildScopedFileName(args.scope, args.prefix, "png"), url);
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
