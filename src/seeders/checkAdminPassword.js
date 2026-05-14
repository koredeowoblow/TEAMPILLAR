#!/usr/bin/env node
import "../config/env.js";
import { connectMongoDB } from "../config/mongodb.js";
import User from "../models/UserModel.js";

async function run() {
  try {
    await connectMongoDB();
    const email =
      process.env.SEED_ADMIN_EMAIL ||
      process.env.ADMIN_EMAIL ||
      "admin@pillarcbt.com";
    const user = await User.findOne({ email }).select("+password").exec();
    if (!user) {
      console.error("User not found:", email);
      process.exit(1);
    }
    console.log("Stored password for", email, ":", user.password);
    process.exit(0);
  } catch (err) {
    console.error("Check failed:", err.message || err);
    process.exit(1);
  }
}

run();
