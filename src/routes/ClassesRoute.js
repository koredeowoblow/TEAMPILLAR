import express from "express";
import ClassesController from "../controllers/ClassesController.js";
import { protectUser, protectAdmin } from "../middleware/authMiddleware.js";
import { tryCatch } from "../utilis/try-catch.js";

const router = express.Router();

router.get("/", protectUser, tryCatch(ClassesController.list));
router.post("/", protectUser, protectAdmin, tryCatch(ClassesController.create));
router.get("/:id", protectUser, tryCatch(ClassesController.get));
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
