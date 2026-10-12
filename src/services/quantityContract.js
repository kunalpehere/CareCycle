// allocatedQuantity remains the total outstanding + fulfilled commitment.
// Keeping that meaning preserves compatibility with the pre-Day-6 writer.
export const quantityAccounting = ({ quantity, allocatedQuantity = 0, handedOverQuantity = 0 }) => {
    for (const value of [quantity, allocatedQuantity, handedOverQuantity]) {
        if (!Number.isSafeInteger(value) || value < 0 || value > 100) throw new RangeError("Quantities must be whole numbers between 0 and 100.");
    }
    if (quantity < 1 || handedOverQuantity > allocatedQuantity || allocatedQuantity > quantity) {
        throw new RangeError("Require 0 <= handed over <= allocated <= total, with a positive total.");
    }
    return { total: quantity, allocated: allocatedQuantity, reserved: allocatedQuantity - handedOverQuantity,
        handedOver: handedOverQuantity, available: quantity - allocatedQuantity };
};

// Released units are an event, not another subtraction from availability.
export const changeQuantityCommitment = (listing, action, units) => {
    const current = quantityAccounting(listing);
    if (!Number.isSafeInteger(units) || units < 1) throw new RangeError("Units must be a positive whole number.");
    let allocatedQuantity = current.allocated;
    let handedOverQuantity = current.handedOver;
    if (action === "reserve") allocatedQuantity += units;
    else if (action === "release" && units <= current.reserved) allocatedQuantity -= units;
    else if (action === "handover" && units <= current.reserved) handedOverQuantity += units;
    else throw new RangeError("Unknown action or units exceed the outstanding reservation.");
    const result = { quantity: current.total, allocatedQuantity, handedOverQuantity };
    quantityAccounting(result);
    return result;
};
