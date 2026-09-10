export const STORE_ORDERING_STATUS = Object.freeze({
  OPEN: "open",
  BUSY: "busy",
  CLOSED: "closed",
});

export const STORE_ORDERING_STATUS_OPTIONS = Object.freeze([
  { value: STORE_ORDERING_STATUS.OPEN, label: "Open", description: "Accepting customer orders" },
  { value: STORE_ORDERING_STATUS.BUSY, label: "Busy", description: "Ask customers to try again in 30 minutes" },
  { value: STORE_ORDERING_STATUS.CLOSED, label: "Closed", description: "Not accepting orders today" },
]);

export function normalizeStoreOrderingStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return Object.values(STORE_ORDERING_STATUS).includes(normalized)
    ? normalized
    : STORE_ORDERING_STATUS.OPEN;
}

export function storeOrderingStatusMessage(value) {
  const status = normalizeStoreOrderingStatus(value);
  if (status === STORE_ORDERING_STATUS.BUSY) {
    return {
      status,
      title: "Store is busy",
      message: "The store is currently busy. Please try ordering again after 30 minutes.",
    };
  }
  if (status === STORE_ORDERING_STATUS.CLOSED) {
    return {
      status,
      title: "Store is closed",
      message: "The store is closed today.",
    };
  }
  return null;
}

export function storeOrderingStatusFromError(error) {
  const message = String(error?.message || error || "").toUpperCase();
  if (message.includes("STORE_ORDERING_BUSY")) return STORE_ORDERING_STATUS.BUSY;
  if (message.includes("STORE_ORDERING_CLOSED")) return STORE_ORDERING_STATUS.CLOSED;
  return null;
}
