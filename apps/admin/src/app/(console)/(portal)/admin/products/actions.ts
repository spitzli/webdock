"use server";
import { revalidatePath } from "next/cache";
import { studioCall } from "@/lib/studio-client";
import { StudioError } from "@/lib/studio-errors";
export type CatalogState = { error?: string; success?: string };
export async function createVersionAction(
  _state: CatalogState,
  form: FormData,
): Promise<CatalogState> {
  try {
    await studioCall("billing.createVersion", [
      {
        sku: form.get("sku"),
        name: form.get("name"),
        visibility: form.get("visibility"),
        operationallyReady: form.get("ready") === "on",
        amount: Number(form.get("amount")),
        currency: form.get("currency"),
        taxBehavior: form.get("taxBehavior"),
        interval: form.get("interval"),
        description: form.get("description"),
        terms: form.get("terms"),
        entitlements: {
          websites: 1,
          editors: Number(form.get("editors")),
          mediaBytes: String(Number(form.get("mediaMB")) * 1_000_000),
          mailMonthly: Number(form.get("mailMonthly")),
        },
      },
    ]);
    revalidatePath("/admin/products");
    return { success: "Product version saved as a draft." };
  } catch (error) {
    return {
      error:
        error instanceof StudioError
          ? error.message
          : "The product version could not be saved.",
    };
  }
}
export async function publishVersionAction(
  environment: string,
  versionID: string,
  _state: CatalogState,
): Promise<CatalogState> {
  try {
    await studioCall("billing.publish", [{ environment, versionID }]);
    revalidatePath("/admin/products");
    return { success: "Product publication verified." };
  } catch (error) {
    revalidatePath("/admin/products");
    return {
      error:
        error instanceof StudioError
          ? error.message
          : "Publication could not be confirmed. Review the existing operation before retrying.",
    };
  }
}
export async function privateOfferAction(
  environment: string,
  versionID: string,
  _state: CatalogState & { url?: string },
  form: FormData,
): Promise<CatalogState & { url?: string }> {
  try {
    const offer = await studioCall<{ url: string }>("billing.createOffer", [
      {
        environment,
        versionID,
        customerID: form.get("customerID"),
        days: Number(form.get("days")),
      },
    ]);
    return { success: "Private offer created.", url: offer.url };
  } catch (error) {
    return {
      error:
        error instanceof StudioError
          ? error.message
          : "The private offer could not be created.",
    };
  }
}
export async function availabilityAction(
  productID: string,
  _state: CatalogState,
  form: FormData,
): Promise<CatalogState> {
  try {
    await studioCall("billing.availability", [
      {
        productID,
        visibility: form.get("visibility"),
        operationallyReady: form.get("ready") === "on",
      },
    ]);
    revalidatePath("/admin/products");
    return { success: "Product availability saved." };
  } catch (error) {
    return {
      error:
        error instanceof StudioError
          ? error.message
          : "Product availability could not be saved.",
    };
  }
}

export async function archiveVersionAction(
  environment: string,
  versionID: string,
  _state: CatalogState,
): Promise<CatalogState> {
  void _state;
  try {
    await studioCall("billing.archive", [{ environment, versionID }]);
    revalidatePath("/admin/products");
    return {
      success: "Product version archived. Existing subscriptions continue.",
    };
  } catch (error) {
    revalidatePath("/admin/products");
    return {
      error:
        error instanceof StudioError
          ? error.message
          : "Product archival could not be confirmed. Check the existing product before retrying.",
    };
  }
}
