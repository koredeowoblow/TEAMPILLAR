import crypto from "crypto";
import SessionAuditLog from "../models/SessionAuditLog.js";
import PracticeSessionModel from "../models/PracticeSessionModel.js";
import { getRedisClient } from "../config/redis.js";

export default class AuditReplayService {
  /**
   * Generates the SHA-256 hash for an event.
   */
  static generateHash(previousHash, payload, eventVersion, timestamp) {
    const data = previousHash + JSON.stringify(payload) + eventVersion.toString() + timestamp.getTime().toString();
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  /**
   * Appends an event to the hash chain.
   */
  static async appendEvent(sessionId, userId, eventType, eventVersion, payload, metadata = {}) {
    // Note: In high-scale production, this should run async or via a message queue
    // to avoid slowing down the API response time.
    let previousHash = "GENESIS";
    
    if (eventVersion > 1) {
      const lastEvent = await SessionAuditLog.findOne({ sessionId, eventVersion: eventVersion - 1 });
      if (lastEvent) {
        previousHash = lastEvent.eventHash;
      }
    }

    const timestamp = new Date();
    const eventHash = this.generateHash(previousHash, payload, eventVersion, timestamp);

    const log = new SessionAuditLog({
      sessionId,
      userId,
      eventVersion,
      eventType,
      payload,
      timestamp,
      previousHash,
      eventHash,
      metadata
    });

    await log.save();
    return log;
  }

  /**
   * Deterministic Replay Engine
   * Reconstructs state from Audit Logs and validates hash chain integrity.
   */
  static async replaySession(sessionId) {
    const redisClient = await getRedisClient();
    
    // 1. Hard Lock the Session during rebuild
    await redisClient.setEx(`exam:session:${sessionId}:recovery_lock`, 600, "REBUILDING");

    try {
      // 2. Fetch events enforcing STRICT ORDERING by eventVersion ASC ONLY
      const events = await SessionAuditLog.find({ sessionId }).sort({ eventVersion: 1 });
      if (!events || events.length === 0) {
        throw new Error("No audit logs found for session.");
      }

      let reconstructedState = {
        status: "ACTIVE",
        responses: [],
        version: 0,
        finalizationKey: null
      };

      let currentHash = "GENESIS";

      for (const event of events) {
        // 3. Hash Validation
        const expectedHash = this.generateHash(currentHash, event.payload, event.eventVersion, event.timestamp);
        if (expectedHash !== event.eventHash) {
          reconstructedState.status = "CORRUPTED";
          await SessionAuditLog.create({
             sessionId,
             userId: event.userId,
             eventVersion: event.eventVersion + 1,
             eventType: "CORRUPTED_SESSION",
             previousHash: currentHash,
             eventHash: "CHAIN_BROKEN"
          });
          throw new Error(`Hash chain broken at version ${event.eventVersion}`);
        }
        currentHash = event.eventHash;

        // 4. Deterministic State Mutations
        reconstructedState.version = event.eventVersion;
        
        switch (event.eventType) {
          case "SESSION_START":
            reconstructedState.status = "ACTIVE";
            break;
          case "ANSWER_SUBMIT":
            // Deterministically replace or add answer
            reconstructedState.responses = event.payload.responses;
            break;
          case "FENCING_REJECT":
            // Ignore
            break;
          case "FINALIZE_START":
            reconstructedState.status = "FINALIZING";
            reconstructedState.finalizationKey = event.payload.finalizationKey;
            break;
          case "FINALIZE_COMPLETE":
            reconstructedState.status = "FINALIZED";
            break;
        }
      }

      return {
        status: "VALID",
        state: reconstructedState,
        finalHash: currentHash
      };
    } finally {
      // 5. Release Lock
      await redisClient.del(`exam:session:${sessionId}:recovery_lock`);
    }
  }

  /**
   * Global Consistency Verification
   */
  static async verifyGlobalConsistency() {
     // A scheduled worker runs this
     const redisClient = await getRedisClient();
     // ...
     // Logic to scan active Redis sessions and cross-verify with MongoDB and Audit Log
     // In a full implementation, this uses cursors to scan without blocking.
  }
}
