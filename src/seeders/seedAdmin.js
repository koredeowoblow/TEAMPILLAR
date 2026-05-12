#!/usr/bin/env node
import "../config/env.js";
import { connectMongoDB } from "../config/mongodb.js";
import { userRepository } from "../repository/UserRepository.js";

async function run() {
  try {
    await connectMongoDB();

    const email =
      process.env.SEED_ADMIN_EMAIL ||
      process.env.ADMIN_EMAIL ||
      "admin@pillarcbt.com";
    const password =
      process.env.SEED_ADMIN_PASSWORD ||
      process.env.ADMIN_PASSWORD ||
      "ChangeMe123!";
    const name = process.env.SEED_ADMIN_NAME || "Pillar Admin";

    const existing = await userRepository.findByEmail(email);
    if (existing) {
      console.log(
        `Admin user with email ${email} already exists. Updating role/password.`,
      );
      const updated = await userRepository.updateUser(existing._id, {
        name,
        email,
        role: "ADMIN",
        isAdmin: true,
        password,
        emailVerified: true,
      });
      console.log("Updated admin:", updated.email);
      process.exit(0);
    }

    const created = await userRepository.createUser({
      name,
      email,
      password,
      role: "ADMIN",
      isAdmin: true,
      emailVerified: true,
    });

    console.log("Admin user created:", created.email);
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err.message || err);
    process.exit(1);
  }
}

run();
