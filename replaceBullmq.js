import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const replaceInFile = (filePath) => {
  const content = fs.readFileSync(filePath, "utf-8");
  
  // Skip if it doesn't have Queue or Worker
  if (!content.includes("new Queue(") && !content.includes("new Worker(")) {
    return;
  }

  let newContent = content;

  // Add import for bullmqRedis if not exists
  if (!newContent.includes("bullmqRedis")) {
    // calculate relative path to src/config/bullmqRedis.js
    const dir = path.dirname(filePath);
    let relativePath = path.relative(dir, path.join(process.cwd(), "src/config/bullmqRedis.js"));
    if (!relativePath.startsWith(".")) relativePath = "./" + relativePath;
    relativePath = relativePath.replace(/\\/g, "/");

    // Add import statement at top, right after other imports
    const lines = newContent.split("\n");
    const lastImportIndex = lines.findLastIndex(l => l.startsWith("import "));
    lines.splice(lastImportIndex + 1, 0, `import bullmqRedis from "${relativePath}";`);
    newContent = lines.join("\n");
  }

  // Replace { connection: sharedQueueConnection } or { connection: connectionConfig } 
  // or { connection: ... } with { connection: bullmqRedis }
  newContent = newContent.replace(/connection:\s*(?:sharedQueueConnection|connectionConfig|{[^}]+})/g, "connection: bullmqRedis");

  if (newContent !== content) {
    fs.writeFileSync(filePath, newContent, "utf-8");
    console.log(`Updated ${filePath}`);
  }
};

const findFiles = (dir) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      findFiles(fullPath);
    } else if (fullPath.endsWith(".js")) {
      replaceInFile(fullPath);
    }
  }
};

findFiles(path.join(process.cwd(), "src/queues"));
findFiles(path.join(process.cwd(), "src/workers"));
