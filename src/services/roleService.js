export const SELF_REGISTERABLE_ROLES = ["donor", "ngo"];

export const getDashboardPath = (role) => ({
    donor: "/donor/dashboard",
    ngo: "/ngo/dashboard",
    admin: "/admin/dashboard"
}[role] || "/home");
