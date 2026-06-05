import "./src/config/env.js";
import EmailService from "./src/services/emailService.js";
import { connectMongoDB } from "./src/config/mongodb.js";
import mongoose from "mongoose";

async function testSMTP() {
  console.log("Starting SMTP email test...");
  
  try {
    // Connect to DB for logging
    await connectMongoDB();
    console.log("Connected to MongoDB");

    const email = "daystarowolabi@gmail.com";
    const otp = "9999";
    const name = "SMTP Tester";

    console.log(`Sending verification email via SMTP to ${email}...`);
    // This will use SMTP because EMAIL_PROVIDER is set to 'smtp' in .env
    const success = await EmailService.sendEmailVerificationOTP(email, otp, name);

    if (success) {
      console.log("✅ SMTP Email sent successfully!");
    } else {
      console.log("❌ SMTP Email failed to send. Check logs above.");
    }
  } catch (error) {
    console.error("❌ Test script error:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

testSMTP();
