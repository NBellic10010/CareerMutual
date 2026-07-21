import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const output = resolve(
  process.cwd(),
  "apps/web/public/synthetic-challenges/discovery-call-tone.wav",
);
const sampleRate = 8_000;
const durationSeconds = 0.8;
const samples = Math.floor(sampleRate * durationSeconds);
const pcm = Buffer.alloc(samples * 2);
for (let index = 0; index < samples; index += 1) {
  const envelope = Math.min(1, index / 240, (samples - index) / 240);
  const sample = Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 0.16 * envelope;
  pcm.writeInt16LE(Math.round(sample * 32_767), index * 2);
}
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, Buffer.concat([header, pcm]));
