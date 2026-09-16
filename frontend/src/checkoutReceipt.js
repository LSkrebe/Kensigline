export const CHECKOUT_RECEIPT_KEY = "ml.checkout.receipt";

export function peekCheckoutReceiptId() {
  try {
    return sessionStorage.getItem(CHECKOUT_RECEIPT_KEY);
  } catch {
    return null;
  }
}

export function clearCheckoutReceiptId() {
  try {
    sessionStorage.removeItem(CHECKOUT_RECEIPT_KEY);
  } catch {
    /* ignore */
  }
}
