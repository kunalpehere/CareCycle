export const ROLE_PERMISSIONS = Object.freeze({
    donor: Object.freeze(["donation:create", "donation:manage-own", "request:review-own"]),
    ngo: Object.freeze(["organization:manage-own", "donation:discover", "request:create", "request:manage-own"]),
    admin: Object.freeze(["organization:review", "user:moderate", "donation:moderate"])
});

export const roleHasPermission = (role, permission) => ROLE_PERMISSIONS[role]?.includes(permission) || false;
export const sameOwner = (userId, ownerId) => Boolean(userId && ownerId && String(userId) === String(ownerId));
