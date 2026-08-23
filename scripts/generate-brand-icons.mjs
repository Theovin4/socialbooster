import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = await readFile(new URL("../src/app/icon.svg", import.meta.url));
const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));
await sharp(source).resize(512, 512).png({ compressionLevel: 9, palette: true }).toFile(path("../public/icon-512.png"));
await sharp(source).resize(192, 192).png({ compressionLevel: 9, palette: true }).toFile(path("../public/icon-192.png"));
await sharp(source).resize(180, 180).flatten({ background: "#06101f" }).png({ compressionLevel: 9 }).toFile(path("../src/app/apple-icon.png"));
await sharp(source).resize(256, 256).png({ compressionLevel: 9 }).toFile(path("../src/app/favicon-source.png"));
