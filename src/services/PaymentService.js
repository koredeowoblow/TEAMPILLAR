import { logger } from "../core/logger.js";

class PaymentService {
  static async expirePendingPayments() {
    // This project does not currently persist payment records.
    // Keep the cron job safe until payment storage is implemented.
    logger.info(
      "[PaymentService] expirePendingPayments skipped: no payment store configured",
    );
    return { expired: 0 };
  }
}

export default PaymentService;
