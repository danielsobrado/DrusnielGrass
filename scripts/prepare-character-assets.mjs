/**
 * Repacks a KayKit .glb for the procedural actor path.
 *
 * The source packs carry 90+ baked animation clips, which is most of their
 * weight. This project animates imported characters through its own actor
 * runtime rather than playing those clips, so they are pure download cost on a
 * site that already spends its budget on grass. Strip them, drop every buffer
 * view they were the only reference to, and repack the binary chunk.
 *
 * Run manually when refreshing the assets:
 *   node scripts/prepare-character-assets.mjs <source-dir> <output-dir>
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function readGlb(path) {
  const buffer = readFileSync(path);
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error(`${path} is not a binary glTF.`);
  }
  let offset = 12;
  let json;
  let bin = Buffer.alloc(0);
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK) {
      json = JSON.parse(chunk.toString("utf8"));
    } else if (type === BIN_CHUNK) {
      bin = chunk;
    }
    offset += 8 + length + ((4 - (length % 4)) % 4);
  }
  if (json === undefined) {
    throw new Error(`${path} has no JSON chunk.`);
  }
  return { json, bin };
}

/** Every buffer view still reachable once the animations are gone. */
function collectLiveViews(json) {
  const live = new Set();
  const keepAccessor = new Set();
  const noteAccessor = (index) => {
    if (index === undefined || index === null) {
      return;
    }
    keepAccessor.add(index);
    const view = json.accessors[index]?.bufferView;
    if (view !== undefined) {
      live.add(view);
    }
  };

  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      for (const accessor of Object.values(primitive.attributes ?? {})) {
        noteAccessor(accessor);
      }
      noteAccessor(primitive.indices);
      for (const target of primitive.targets ?? []) {
        for (const accessor of Object.values(target)) {
          noteAccessor(accessor);
        }
      }
    }
  }
  for (const skin of json.skins ?? []) {
    noteAccessor(skin.inverseBindMatrices);
  }
  // Images are deliberately not walked. Every character in a pack shares one
  // gradient atlas, so embedding a copy per file wastes both download and a GPU
  // texture, and the runtime would have to fetch each copy back out through a
  // blob: URL that the site's connect-src policy rightly refuses. The atlas
  // ships once alongside the models instead.
  return { live, keepAccessor };
}

/**
 * Drops embedded imagery, leaving materials for the runtime to texture.
 *
 * The shared atlas is applied when the character loads, so the material's
 * colour and alpha settings survive while its texture reference does not.
 */
function stripEmbeddedImages(json) {
  for (const material of json.materials ?? []) {
    delete material.normalTexture;
    delete material.occlusionTexture;
    delete material.emissiveTexture;
    const metallicRoughness = material.pbrMetallicRoughness;
    if (metallicRoughness !== undefined) {
      delete metallicRoughness.baseColorTexture;
      delete metallicRoughness.metallicRoughnessTexture;
    }
  }
  delete json.images;
  delete json.textures;
  delete json.samplers;
}

function repack(json, bin) {
  delete json.animations;
  stripEmbeddedImages(json);
  const { live, keepAccessor } = collectLiveViews(json);

  const viewRemap = new Map();
  const chunks = [];
  let packedLength = 0;
  const originalViews = json.bufferViews ?? [];
  const nextViews = [];
  for (let index = 0; index < originalViews.length; index += 1) {
    if (!live.has(index)) {
      continue;
    }
    const view = originalViews[index];
    const start = view.byteOffset ?? 0;
    const slice = bin.subarray(start, start + view.byteLength);
    // Keep 4-byte alignment, which accessors and texture decoders both expect.
    const padding = (4 - (packedLength % 4)) % 4;
    if (padding > 0) {
      chunks.push(Buffer.alloc(padding));
      packedLength += padding;
    }
    viewRemap.set(index, nextViews.length);
    nextViews.push({ ...view, buffer: 0, byteOffset: packedLength });
    chunks.push(slice);
    packedLength += slice.length;
  }

  const accessorRemap = new Map();
  const nextAccessors = [];
  for (let index = 0; index < (json.accessors ?? []).length; index += 1) {
    if (!keepAccessor.has(index)) {
      continue;
    }
    const accessor = { ...json.accessors[index] };
    if (accessor.bufferView !== undefined) {
      accessor.bufferView = viewRemap.get(accessor.bufferView);
    }
    accessorRemap.set(index, nextAccessors.length);
    nextAccessors.push(accessor);
  }

  const remapAccessor = (index) =>
    index === undefined || index === null ? index : accessorRemap.get(index);
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      for (const [name, accessor] of Object.entries(primitive.attributes ?? {})) {
        primitive.attributes[name] = remapAccessor(accessor);
      }
      if (primitive.indices !== undefined) {
        primitive.indices = remapAccessor(primitive.indices);
      }
      for (const target of primitive.targets ?? []) {
        for (const [name, accessor] of Object.entries(target)) {
          target[name] = remapAccessor(accessor);
        }
      }
    }
  }
  for (const skin of json.skins ?? []) {
    skin.inverseBindMatrices = remapAccessor(skin.inverseBindMatrices);
  }
  json.accessors = nextAccessors;
  json.bufferViews = nextViews;
  json.buffers = [{ byteLength: packedLength }];
  return Buffer.concat(chunks, packedLength);
}

function writeGlb(path, json, bin) {
  const jsonText = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPadding = (4 - (jsonText.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonText, Buffer.alloc(jsonPadding, 0x20)]);
  const binPadding = (4 - (bin.length % 4)) % 4;
  const binChunk = Buffer.concat([bin, Buffer.alloc(binPadding)]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(JSON_CHUNK, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.writeUInt32LE(BIN_CHUNK, 4);

  writeFileSync(
    path,
    Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]),
  );
}

const [sourceDirectory, outputDirectory] = process.argv.slice(2);
if (!sourceDirectory || !outputDirectory) {
  console.error(
    "usage: node scripts/prepare-character-assets.mjs <source-dir> <output-dir>",
  );
  process.exit(1);
}
mkdirSync(resolve(outputDirectory), { recursive: true });

for (const entry of readdirSync(sourceDirectory)) {
  if (extname(entry).toLowerCase() !== ".glb") {
    continue;
  }
  const sourcePath = join(sourceDirectory, entry);
  const { json, bin } = readGlb(sourcePath);
  const clipCount = (json.animations ?? []).length;
  const packed = repack(json, bin);
  const outputPath = join(outputDirectory, basename(entry));
  writeGlb(outputPath, json, packed);
  const before = readFileSync(sourcePath).length;
  const after = readFileSync(outputPath).length;
  console.log(
    `${entry}: dropped ${clipCount} clips, ${(before / 1e6).toFixed(2)} MB -> ${(after / 1e6).toFixed(2)} MB`,
  );
}
