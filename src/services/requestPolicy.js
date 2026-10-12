export const BLOCKING_REQUEST_STATUSES = ["pending", "accepted", "completed"];
export const RETRYABLE_REQUEST_STATUSES = ["rejected", "cancelled"];
export const REQUEST_INDEX_NAME = "request_current_attempt_v1";
export const REQUEST_INDEX_FILTER = { status: { $in: BLOCKING_REQUEST_STATUSES } };
export const isRequestPairIndex = index => Object.keys(index.key).length === 2 && index.key.donation === 1 && index.key.organization === 1;
export const isCurrentRequestIndex = index => index.name === REQUEST_INDEX_NAME && isRequestPairIndex(index) && index.unique === true &&
    JSON.stringify(index.partialFilterExpression) === JSON.stringify(REQUEST_INDEX_FILTER);

export class RequestIndexError extends Error {
    constructor() { super("Request index migration is required. Stop writers and follow docs/day-7-request-policies.md before starting CareCycle."); }
}
export const verifyRequestIndexes = async connection => {
    const indexes = await connection.collection("donation_requests").indexes();
    if (!indexes.some(isCurrentRequestIndex) || indexes.some(index => isRequestPairIndex(index) && index.unique && !isCurrentRequestIndex(index))) {
        throw new RequestIndexError();
    }
};

export const expectedListingVersion = value => typeof value === "string" && /^(0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
