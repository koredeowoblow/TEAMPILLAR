import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Question from '../src/models/QuestionModel.js';

dotenv.config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;

async function queryGroq(prompt) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama3-8b-8192",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3
    })
  });
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

const regenerateExplanations = async () => {
  console.log("Connecting to Database...");
  await mongoose.connect(process.env.MONGO_URI);

  // Find quarantined questions missing explanations
  const questions = await Question.find({ 
    isQuarantined: true, 
    quarantineReason: { $regex: /Missing explanation/i } 
  }).limit(50); // Process in batches

  console.log(`Found ${questions.length} quarantined questions missing explanations.`);

  let recovered = 0;

  for (const q of questions) {
    const questionText = q.content?.text || q.text || '';
    const correctOption = q.options?.find(o => o.isCorrect);

    if (!questionText || !correctOption) continue;

    const prompt = `
    You are an expert tutor. Provide a clear, concise step-by-step explanation (max 3 sentences) for why the following answer is correct.
    
    Question: ${questionText}
    Correct Answer: ${correctOption.text}
    `;

    try {
      const explanation = await queryGroq(prompt);
      
      if (explanation.length > 10) {
        // Update explanation and un-quarantine if this was the only reason
        const newReason = q.quarantineReason.replace(/Missing explanation/i, '').replace(/\|\|/g, '|').trim();
        const stillQuarantined = newReason.length > 3;

        await Question.findByIdAndUpdate(q._id, { 
          explanation: explanation,
          'explanationDetails.whyCorrect': explanation,
          isQuarantined: stillQuarantined,
          quarantineReason: stillQuarantined ? newReason : null
        });
        recovered++;
        console.log(`Regenerated explanation for Q:${q.metadata?.questionCode || q._id}. Quarantined: ${stillQuarantined}`);
      }
    } catch (e) {
      console.error(`Failed to generate explanation Q:${q._id}`, e.message);
    }

    await new Promise(r => setTimeout(r, 500)); 
  }

  console.log(`\nRecovery complete. Regenerated explanations for ${recovered} questions.`);
  process.exit(0);
};

regenerateExplanations().catch(console.error);
