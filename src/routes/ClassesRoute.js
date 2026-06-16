import express from "express";
import ClassesController from "../controllers/ClassesController.js";
import { protectUser, protectAdmin } from "../middleware/authMiddleware.js";
import { tryCatch } from "../utils/try-catch.js";
<<<<<<< HEAD
import { requireRole } from "../middleware/rbac.js";
=======
import { generalLimiter } from "../middleware/rateLimiters.js";
>>>>>>> 5dec3aa08c36e982f5060e99d28f66dd21328198

const router = express.Router();
router.use(generalLimiter);

router.get("/", protectUser, requireRole("STUDENT"), tryCatch(ClassesController.list));
router.post("/", protectUser, protectAdmin, tryCatch(ClassesController.create));
router.get("/:id", protectUser, requireRole("STUDENT"), tryCatch(ClassesController.get));
router.put(
  "/:id",
  protectUser,
  protectAdmin,
  tryCatch(ClassesController.update),
);
router.delete(
  "/:id",
  protectUser,
  protectAdmin,
  tryCatch(ClassesController.remove),
);

export default router;
