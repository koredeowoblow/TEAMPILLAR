import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME || 'teampillar' });
  
  const Question = mongoose.model('Question', new mongoose.Schema({}, { strict: false }));
  const Passage = mongoose.model('Passage', new mongoose.Schema({}, { strict: false }));
  const Subject = mongoose.model('Subject', new mongoose.Schema({}, { strict: false }));
  
  const engSub = await Subject.findOne({ name: /english/i });
  const phySub = await Subject.findOne({ name: /physics/i });

  const engQ = await Question.countDocuments({ subjectId: engSub._id, isQuarantined: { $ne: true } });
  const engNoInstr = await Question.countDocuments({ subjectId: engSub._id, isQuarantined: { $ne: true }, 'metadata.instruction': { $exists: false } });
  
  const engPassages = await Question.countDocuments({ subjectId: engSub._id, passageId: { $exists: true, $ne: null }, isQuarantined: { $ne: true } });
  
  const badPassages = await Question.aggregate([
    { $match: { subjectId: engSub._id, isQuarantined: { $ne: true } } },
    { $lookup: { from: 'passages', localField: 'passageId', foreignField: '_id', as: 'p' } },
    { $match: { passageId: { $exists: true, $ne: null }, 'p': { $size: 0 } } }
  ]);
  
  const emptyPassages = await Question.aggregate([
    { $match: { subjectId: engSub._id, isQuarantined: { $ne: true } } },
    { $lookup: { from: 'passages', localField: 'passageId', foreignField: '_id', as: 'p' } },
    { $match: { 'p.text': { $in: [null, '', '<p><br></p>'] } } }
  ]);
  
  console.log('English Active Qs:', engQ);
  console.log('English missing instructions:', engNoInstr);
  console.log('English with passages:', engPassages);
  console.log('Orphan passages (ID exists but no document):', badPassages.length);
  console.log('Empty passages (document exists but text is empty):', emptyPassages.length);
  
  process.exit();
})();
