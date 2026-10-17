import fs from "node:fs/promises";
import path from "node:path";

let queue = Promise.resolve();

export function createIdStore(dataDirectory) {
  const counterFile = path.join(dataDirectory, "report-counter.json");
  const firstCarId = 101;
  const minimumLastId = firstCarId - 1;

  async function loadLastId() {
    try {
      const contents = await fs.readFile(counterFile, "utf8");
      const stored = JSON.parse(contents);
      if (Number.isSafeInteger(stored?.lastId) && stored.lastId >= 0) {
        return Math.max(minimumLastId, stored.lastId);
      }
    } catch (error) {
      if (error.code !== "ENOENT" && error.name !== "SyntaxError") {
        throw error;
      }
    }
    return minimumLastId;
  }

  async function allocate() {
    const operation = queue.then(async () => {
      await fs.mkdir(dataDirectory, { recursive: true });
      const lastId = await loadLastId();
      const nextId = lastId + 1;
      const temporaryFile = `${counterFile}.${process.pid}.tmp`;
      await fs.rm(temporaryFile, { force: true });
      await fs.writeFile(temporaryFile, JSON.stringify({ lastId: nextId }), "utf8");
      await fs.rename(temporaryFile, counterFile);
      return nextId;
    });

    queue = operation.catch(() => {});
    return operation;
  }

  async function peekNextId() {
    await fs.mkdir(dataDirectory, { recursive: true });
    return (await loadLastId()) + 1;
  }

  return { nextId: allocate, peekNextId };
}
