import fs from "fs";
import path from "path";

const findFiles = (dir) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      findFiles(fullPath);
    } else if (fullPath.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf-8');
      if (content.includes('bullmqConnection.js')) {
        content = content.replace(/import\s+{.*}\s+from\s+["']\.\.\/config\/bullmqConnection\.js["'];?\r?\n?/g, '');
        fs.writeFileSync(fullPath, content);
      }
    }
  }
};

findFiles('src/queues');
findFiles('src/workers');

if (fs.existsSync('src/config/bullmqConnection.js')) {
  fs.unlinkSync('src/config/bullmqConnection.js');
}
