import bcrypt from "bcrypt";
import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { User } from "../src/models/User.js";
import { normalizeEmail } from "../src/validators/input.js";

const name = String(process.env.ADMIN_NAME || '').trim();
const email = normalizeEmail(process.env.ADMIN_EMAIL);
const password = String(process.env.ADMIN_PASSWORD || '');
if (name.length < 2 || !email.includes('@') || password.length < 12) {
    console.error('Set ADMIN_NAME, ADMIN_EMAIL, and an ADMIN_PASSWORD of at least 12 characters.');
    process.exitCode = 1;
} else {
    try {
        await connectDatabase();
        const hash = await bcrypt.hash(password, 12);
        const existing = await User.findOne({ email });
        if (existing && existing.role !== 'admin') throw new Error('That email already belongs to a non-administrator account.');
        await User.findOneAndUpdate({ email }, { $set: { name, email, password: hash, role: 'admin', status: 'active' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
        console.log(`Administrator provisioned: ${email}`);
    } catch (error) { console.error(`Unable to provision administrator: ${error.message}`); process.exitCode = 1; }
    finally { await disconnectDatabase(); }
}
