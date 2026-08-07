export const showHome = (req, res) => res.render("home.ejs");
export const showAbout = (req, res) => res.render("about.ejs");
export const showContact = (req, res) => res.render("contact.ejs", { message: "" });
