import fs from "node:fs/promises";
import path from "node:path";

let queue = Promise.resolve();

export function createIdStore(dataDirectory) {
  const counterFile = path.join(dataDirectory, "report-counter.json");

  async function allocate() {
    const operation = queue.then(async () => {
      await fs.mkdir(dataDirectory, { recursive: true });
      let lastId = 0;
      try {
        const stored = JSON.parse(await fs.readFile(counterFile, "utf8"));
        if (Number.isSafeInteger(stored.lastId) && stored.lastId >= 0) {
          lastId = stored.lastId;
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }

      const nextId = lastId + 1;
      const temporaryFile = `${counterFile}.${process.pid}.tmp`;
      await fs.writeFile(temporaryFile, JSON.stringify({ lastId: nextId }), "utf8");
      await fs.rename(temporaryFile, counterFile);
      return nextId;
    });

    queue = operation.catch(() => {});
    return operation;
  }

  return { nextId: allocate };
}
