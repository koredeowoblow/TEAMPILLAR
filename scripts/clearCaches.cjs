const mongoose = require('mongoose');
const redis = require('redis');
require('dotenv').config();

async function clearCaches() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    const result = await mongoose.connection.collection('useranalytics').deleteMany({});
    console.log('Deleted UserAnalytics documents: ' + result.deletedCount);

    const redisUrl = `redis://:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}/0`;
    const client = redis.createClient({ url: redisUrl });
    await client.connect();
    console.log('Connected to Redis');
    
    await client.flushAll();
    console.log('Redis Cache flushed successfully');
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
clearCaches();
