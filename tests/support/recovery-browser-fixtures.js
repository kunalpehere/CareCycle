import { writeFile } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcrypt";
import { User } from "../../src/models/User.js";
import { issueAccountCredential } from "../../src/services/accountRecoveryService.js";

export const seedRecoveryBrowserFixtures = async root => {
    const manifest = {};
    for (const project of ["desktop", "mobile"]) {
        const user = await User.create({ name: "Synthetic Recovery Browser", email: `recovery-day19-${project}@example.invalid`, password: await bcrypt.hash("Recovery-fixture-19!", 10), role: "donor" });
        const links = {};
        for (const purpose of ["reset", "verification"]) await issueAccountCredential(user, purpose, { send: async ({ url }) => {
            const link = new URL(url); links[purpose] = link.pathname + link.search; return { sent: true };
        } });
        manifest[project] = { email: user.email, ...links };
    }
    // Synthetic credentials are confined to ignored artifacts, never production routes.
    await writeFile(path.join(root, "artifacts/day-19-fixtures.json"), JSON.stringify(manifest));
};
