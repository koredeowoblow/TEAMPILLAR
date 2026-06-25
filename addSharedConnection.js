import fs from "fs";
import path from "path";

const addSharedConnection = (dir) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      addSharedConnection(fullPath);
    } else if (fullPath.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf-8');
      
      // For Queues:
      if (content.includes('new Queue(') && !content.includes('sharedConnection')) {
        content = content.replace(/connection:\s*bullmqRedis\s*,?/g, "connection: bullmqRedis, sharedConnection: true,");
      }
      
      // For Workers:
      if (content.includes('new Worker(') && !content.includes('sharedConnection')) {
        content = content.replace(/connection:\s*bullmqRedis\s*,?/g, "connection: bullmqRedis, sharedConnection: true,");
      }

      fs.writeFileSync(fullPath, content);
    }
  }
};

addSharedConnection('src/queues');
addSharedConnection('src/workers');
