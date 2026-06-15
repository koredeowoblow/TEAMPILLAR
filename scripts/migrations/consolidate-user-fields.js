import mongoose from "mongoose";
import User from "../../src/models/UserModel.js";
import "../../src/config/env.js";
import { connectMongoDB } from "../../src/config/mongodb.js";

async function runMigration() {
  console.log("Starting user field consolidation migration...");
  
  try {
    await connectMongoDB();
    
    let processed = 0;
    let updated = 0;
    let skipped = 0;

    const cursor = User.find().cursor();

    for await (const user of cursor) {
      processed++;
      
      const hasIsPro = user.get('isPro') !== undefined;
      const hasSubscription = user.get('subscription') !== undefined;
      const hasOnboardingEmailVerified = user.get('onboarding.emailVerified') !== undefined;
      
      if (!hasIsPro && !hasSubscription && !hasOnboardingEmailVerified) {
        skipped++;
        if (processed % 100 === 0) {
          console.log(`Processed ${processed} documents...`);
        }
        continue;
      }

      // Determine new subscription status based on old fields logic
      let newStatus = user.subscriptionStatus || "free";
      if (user.role === "ADMIN" || user.role === "TUTOR") {
        newStatus = "paid"; // Given logic resolves to "pro", we'll use "paid" to align with schema
      } else if (user.get('isPro') === true) {
        newStatus = "active";
      } else if (user.subscriptionStatus === "active") {
        newStatus = "active";
      } else if (user.get('subscription') === "pro") {
        newStatus = "active";
      }
      
      // Determine new emailVerified
      let newEmailVerified = user.emailVerified || false;
      if (user.get('onboarding.emailVerified') === true) {
        newEmailVerified = true;
      }

      // Update document using updateOne
      const updateData = {
        $set: {
          subscriptionStatus: newStatus,
          emailVerified: newEmailVerified,
        },
        $unset: {
          isPro: 1,
          subscription: 1,
          "onboarding.emailVerified": 1,
        }
      };

      await User.updateOne({ _id: user._id }, updateData);
      updated++;

      if (processed % 100 === 0) {
        console.log(`Processed ${processed} documents...`);
      }
    }

    console.log("Migration completed successfully.");
    console.log(`Total processed: ${processed}`);
    console.log(`Total updated: ${updated}`);
    console.log(`Total skipped: ${skipped}`);
    
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

runMigration();
