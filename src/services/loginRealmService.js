export const LOGIN_REALMS = Object.freeze({
    participant: Object.freeze(["donor", "ngo"]),
    administration: Object.freeze(["admin"])
});

export const roleCanUseRealm = (role, realm) => LOGIN_REALMS[realm]?.includes(role) || false;
