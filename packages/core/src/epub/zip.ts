import {
  TextReader,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
  configure,
} from "@zip.js/zip.js";

configure({ useWebWorkers: false });

export async function replaceZipTextEntry(
  bytes: Uint8Array,
  targetPath: string,
  content: string,
): Promise<Uint8Array> {
  const reader = new ZipReader(new Uint8ArrayReader(bytes));
  const writer = new ZipWriter(new Uint8ArrayWriter(), { extendedTimestamp: false });
  const writeOptions = {
    level: 0,
    lastAccessDate: new Date(0),
    lastModDate: new Date(0),
  };
  let replaced = false;

  try {
    const entries = await reader.getEntries();
    for (const entry of entries) {
      if (entry.directory) {
        await writer.add(entry.filename, undefined, { directory: true });
        continue;
      }

      if (entry.filename === targetPath) {
        await writer.add(entry.filename, new TextReader(content), writeOptions);
        replaced = true;
        continue;
      }

      if (!entry.getData) continue;
      await writer.add(
        entry.filename,
        new Uint8ArrayReader(await entry.getData(new Uint8ArrayWriter())),
        writeOptions,
      );
    }
  } finally {
    await reader.close();
  }

  if (!replaced) {
    await writer.close();
    throw new Error(`EPUB entry was not found: ${targetPath}`);
  }

  return writer.close();
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
