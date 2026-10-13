import { sendContactMail } from "../services/mailService.js";
import { validateContact } from "../validators/input.js";
import { recordMailOutcome } from "../services/observabilityService.js";

export const submitContact = async (req, res, next) => {
    try {
        const { valid, value } = validateContact(req.body);
        const values = { name: value.name.slice(0, 80), email: value.email.slice(0, 254), message: value.message.slice(0, 2000) };
        if (!valid) return res.status(400).render("contact.ejs", { message: "Enter a valid name, email, and message.", values });
        let result;
        try { result = await sendContactMail(value); }
        catch {
            recordMailOutcome("contact", { sent: false, reason: "delivery-failed" });
            return res.status(503).render("contact.ejs", { message: "Your message could not be sent. Your entries are kept below so you can try again later.", values });
        }
        recordMailOutcome("contact", result);
        res.status(result.sent ? 200 : 503).render("contact.ejs", {
            message: result.sent ? "Your message was sent. This does not guarantee a reply time." : "Contact email is currently unavailable. Your message has not been sent or saved. Your entries are kept below.",
            values: result.sent ? {} : values
        });
    } catch (error) {
        next(error);
    }
};
