import "../src/config/env.js";
import { connectMongoDB } from "../src/config/mongodb.js";
import Auth from "../src/models/AuthModel.js";

async function logoutAllUsers() {
  console.log("Starting script to log out all active user sessions...");
  
  try {
    await connectMongoDB();
    
    const now = new Date();
    
    // Find all sessions that are not currently logged out and mark them as logged out
    const result = await Auth.updateMany(
      { isLoggedOut: { $ne: true } },
      { 
        $set: { 
          isLoggedOut: true, 
          loggedOutAt: now 
        } 
      }
    );
    
    console.log("Migration completed successfully.");
    console.log(`Total sessions found and marked as logged out: ${result.modifiedCount}`);
    
    process.exit(0);
  } catch (err) {
    console.error("Failed to log out all users:", err);
    process.exit(1);
  }
}

logoutAllUsers();
