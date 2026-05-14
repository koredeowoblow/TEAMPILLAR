#!/usr/bin/env node
import "../config/env.js";
import { connectMongoDB } from "../config/mongodb.js";
import { userRepository } from "../repository/UserRepository.js";

async function run() {
  try {
    await connectMongoDB();

    const count = Number.parseInt(process.env.SEED_STUDENTS_COUNT || "10", 10);
    const domain = process.env.SEED_STUDENTS_DOMAIN || "example.com";
    const password = process.env.SEED_STUDENTS_PASSWORD || "Student123!";
    const prefix = process.env.SEED_STUDENTS_PREFIX || "student";

    const created = [];
    for (let i = 1; i <= count; i++) {
      const email = `${prefix}${i}@${domain}`;
      const name = `Student ${i}`;

      const existing = await userRepository.findByEmail(email);
      if (existing) {
        // ensure role and basic flags are correct and reset password
        await userRepository.updateUser(existing._id, {
          name,
          role: "STUDENT",
          emailVerified: true,
          password,
        });
        console.log(`Updated existing student: ${email} (password set)`);
        created.push(email);
        continue;
      }

      const user = await userRepository.createUser({
        name,
        email,
        password,
        role: "STUDENT",
        emailVerified: true,
      });
      created.push(user.email);
      console.log(`Created student: ${user.email} (password: ${password})`);
    }

    console.log(`Seeding complete. Created: ${created.length} student(s).`);
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err.message || err);
    process.exit(1);
  }
}

run();
