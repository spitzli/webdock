import { withDatabaseScope } from "@webdock/database-runtime";
import { databasePools } from "../../db/runtime";
import { billingWorkerProvider } from "./worker-provider";
import { verifyPublishedProduct, type PublishedTerms } from "./catalog-policy";
import type { BillingEnvironment } from "./types";
export async function reconcileCatalog(environment: BillingEnvironment) {
  return withDatabaseScope(
    { kind: "system", purpose: `polar:${environment}:catalog` },
    async () => {
      const { polar, organizationID } =
        await billingWorkerProvider(environment);
      const rows = (
        await databasePools.worker.query(
          "SELECT webdock_rls.billing_catalog_terms($1,NULL) AS value",
          [environment],
        )
      ).rows;
      for (const { value } of rows) {
        const terms = value as PublishedTerms & { productID: string };
        if (terms.organizationID !== organizationID)
          throw Error("Billing organization mismatch");
        // A read outage leaves the prior state intact. Only a completed, mismatching read marks drift.
        const started = (
          await databasePools.worker.query(
            "SELECT statement_timestamp() AS started",
          )
        ).rows[0].started;
        const product = await polar.products.get(terms.productID);
        let matches = true;
        try {
          verifyPublishedProduct(product, terms);
        } catch {
          matches = false;
        }
        await databasePools.worker.query(
          "UPDATE webdock_auth.billing_product_mapping SET status=$3,error_code=$4,checked_at=$7 WHERE environment=$1 AND version_id=$2 AND polar_product_id=$5 AND desired_hash=$6 AND status<>'archived' AND (checked_at IS NULL OR checked_at<=$7)",
          [
            environment,
            terms.versionID,
            matches ? "ready" : "needs_review",
            matches ? null : "catalog_drift",
            terms.productID,
            terms.hash,
            started,
          ],
        );
      }
    },
  );
}
