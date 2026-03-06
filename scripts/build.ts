import { $ } from "bun";
import { existsSync, mkdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";

const targets = [
  { name: "lr-darwin-arm64", target: "bun-darwin-arm64" },
  { name: "lr-darwin-x64", target: "bun-darwin-x64" },
  { name: "lr-linux-x64", target: "bun-linux-x64" },
  { name: "lr-linux-arm64", target: "bun-linux-arm64" },
];

const distDir = join(import.meta.dir, "..", "dist");

if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

console.log("Building lr CLI binaries...\n");

const checksumLines: string[] = [];

for (const { name, target } of targets) {
  const outfile = join(distDir, name);
  console.log(`Building ${name} (${target})...`);

  try {
    await $`bun build src/index.ts --compile --outfile ${outfile} --target ${target}`.cwd(
      join(import.meta.dir, "..")
    );

    const size = statSync(outfile).size;
    const sizeMB = (size / 1024 / 1024).toFixed(1);
    console.log(`  -> ${sizeMB} MB\n`);

    // Generate checksum
    let checksum: string;
    if (process.platform === "darwin") {
      checksum = (
        await $`shasum -a 256 ${outfile}`.text()
      ).trim();
    } else {
      checksum = (
        await $`sha256sum ${outfile}`.text()
      ).trim();
    }

    // Normalize to just "hash  filename" (basename only)
    const hash = checksum.split(/\s+/)[0];
    checksumLines.push(`${hash}  ${name}`);
  } catch (err) {
    console.error(`  Failed to build ${name}:`, err);
    process.exit(1);
  }
}

// Write checksums file
const checksumsPath = join(distDir, "checksums.txt");
writeFileSync(checksumsPath, checksumLines.join("\n") + "\n");

console.log("Checksums written to dist/checksums.txt");
console.log("\nBuild complete! Binaries:");
for (const { name } of targets) {
  const outfile = join(distDir, name);
  const size = statSync(outfile).size;
  const sizeMB = (size / 1024 / 1024).toFixed(1);
  console.log(`  ${name}  ${sizeMB} MB`);
}
