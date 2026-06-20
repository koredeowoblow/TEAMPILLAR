import cache from "./cache.js";

/**
 * Mongoose plugin that automatically flushes the admin dashboard and analytics 
 * caches whenever a document is created, updated, or deleted.
 */
export const autoClearCachePlugin = (schema) => {
  const clearAnalyticsAndAdminCaches = async function () {
    try {
      // Invalidate specific cache patterns related to Admin Stats and Analytics
      await cache.invalidatePattern("admin:dashboard:stats*");
      await cache.invalidatePattern("analytics:*");
    } catch (err) {
      console.error("Cache invalidation error:", err);
    }
  };

  // Document middleware (e.g. doc.save())
  schema.post("save", clearAnalyticsAndAdminCaches);
  schema.post("remove", clearAnalyticsAndAdminCaches);

  // Query middleware (e.g. Model.updateOne(), Model.deleteMany())
  const queryOps = [
    "updateOne",
    "updateMany",
    "findOneAndUpdate",
    "deleteOne",
    "deleteMany",
    "findOneAndDelete",
    "insertMany",
  ];

  queryOps.forEach((op) => {
    schema.post(op, clearAnalyticsAndAdminCaches);
  });
};
