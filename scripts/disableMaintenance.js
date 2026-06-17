import "../src/config/env.js";
import { connectMongoDB } from "../src/config/mongodb.js";
import PlatformSettings from "../src/models/PlatformSettingsModel.js";

async function disableMaintenanceMode() {
  console.log("Starting script to disable maintenance mode...");
  
  try {
    await connectMongoDB();
    
    // Update the maintenanceMode flag in PlatformSettings to false
    const result = await PlatformSettings.updateOne(
      {}, 
      { $set: { maintenanceMode: false } },
      { upsert: true } // If no settings document exists, create one with maintenanceMode = false
    );
    
    console.log("Success! Maintenance mode has been disabled.");
    if (result.modifiedCount > 0) {
      console.log("The system is now live and accessible to users.");
    } else if (result.upsertedCount > 0) {
      console.log("Created initial platform settings with maintenance mode disabled.");
    } else {
      console.log("Maintenance mode was already disabled. No changes made.");
    }
    
    process.exit(0);
  } catch (err) {
    console.error("Failed to disable maintenance mode:", err);
    process.exit(1);
  }
}

disableMaintenanceMode();
