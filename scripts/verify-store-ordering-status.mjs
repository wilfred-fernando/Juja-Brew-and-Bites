import assert from "node:assert/strict";
import {
  normalizeStoreOrderingStatus,
  STORE_ORDERING_STATUS,
  storeOrderingStatusFromError,
  storeOrderingStatusMessage,
} from "../lib/storeOrderingStatus.js";

assert.equal(normalizeStoreOrderingStatus(" BUSY "), STORE_ORDERING_STATUS.BUSY);
assert.equal(normalizeStoreOrderingStatus("unexpected"), STORE_ORDERING_STATUS.OPEN);
assert.equal(storeOrderingStatusMessage("open"), null);
assert.match(storeOrderingStatusMessage("busy").message, /30 minutes/i);
assert.match(storeOrderingStatusMessage("closed").message, /closed today/i);
assert.equal(storeOrderingStatusFromError({ message: "STORE_ORDERING_BUSY" }), STORE_ORDERING_STATUS.BUSY);
assert.equal(storeOrderingStatusFromError({ message: "STORE_ORDERING_CLOSED" }), STORE_ORDERING_STATUS.CLOSED);
assert.equal(storeOrderingStatusFromError({ message: "network failed" }), null);

console.log("Store ordering status checks passed.");
