import { sendContactMail } from "../services/mailService.js";
import { validateContact } from "../validators/input.js";

export const submitContact = async (req, res, next) => {
    try {
        const { valid, value } = validateContact(req.body);
        if (!valid) return res.status(400).render("contact.ejs", { message: "Enter a valid name, email, and message." });
        const result = await sendContactMail(value);
        res.render("contact.ejs", { message: result.sent ? "Your message was sent successfully." : "Contact email is not configured yet." });
    } catch (error) {
        next(error);
    }
};
