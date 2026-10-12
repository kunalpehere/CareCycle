import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import ejs from "ejs";

const render = (name, data) => ejs.renderFile(path.resolve("views", name), {
    csrfToken: "test-token",
    currentUser: { id: "user-id", name: "Test Donor", email: "donor@example.com", role: "donor" },
    ...data
});

test("donor matching reveals contact only after acceptance", async () => {
    const base = { _id: "507f1f77bcf86cd799439015", beneficiary: "A community-clinic patient", message: "Mobility support is needed during rehabilitation.", quantity: 1, createdAt: new Date(), donation: { equipment: "wheelchair", quantity: 1, allocatedQuantity: 0, location: { city: "Pune", state: "Maharashtra" } }, organizationPublic: { name: "Mobility Trust", description: "Community mobility support", address: { city: "Pune", state: "Maharashtra" } } };
    const pending = await render("donor-requests.ejs", { requests: [{ ...base, status: "pending" }], message: "" });
    assert.match(pending, /Accept request/);
    assert.doesNotMatch(pending, /asha@example\.org/);
    const accepted = await render("donor-requests.ejs", { requests: [{ ...base, status: "accepted", organizationContact: { contactPerson: "Asha", contactEmail: "asha@example.org", phone: "9876543210" } }], message: "" });
    assert.match(accepted, /asha@example\.org/);
    assert.doesNotMatch(accepted, /Accept request/);
});

test("equipment detail renders request form and request history renders cancellation only for pending", async () => {
    const donation = { _id: "507f1f77bcf86cd799439012", equipment: "wheelchair", condition: "good", quantity: 5, allocatedQuantity: 3, availableQuantity: 2,
        description: "A maintained folding wheelchair.", location: { city: "Pune", state: "Maharashtra", postalCode: "411001" }, images: [], createdAt: new Date("2026-08-01"), status: "available" };
    const detail = await render("equipment-detail.ejs", { currentUser: { role: "ngo" }, donation, organization: { name: "Mobility Trust" }, existingRequest: null, message: "" });
    assert.match(detail, /Request this equipment/);
    assert.match(detail, /name="beneficiary"/);
    assert.match(detail, /max="2"/);
    const history = await render("ngo-requests.ejs", { currentUser: { role: "ngo" }, organization: { name: "Mobility Trust" }, message: "", requests: [
        { _id: "507f1f77bcf86cd799439013", donation, quantity: 1, beneficiary: "A patient at the community clinic", status: "pending", createdAt: new Date() },
        { _id: "507f1f77bcf86cd799439014", donation, quantity: 1, beneficiary: "Another community beneficiary", status: "rejected", createdAt: new Date() }
    ] });
    assert.equal((history.match(/Cancel request/g) || []).length, 1);
});

test("verified NGO discovery renders safe listing data without donor identity", async () => {
    const donation = { _id: "507f1f77bcf86cd799439012", equipment: "wheelchair", condition: "good", quantity: 5, allocatedQuantity: 2, availableQuantity: 3,
        description: "A maintained folding wheelchair.", location: { city: "Pune", state: "Maharashtra", postalCode: "411001" },
        images: [], createdAt: new Date("2026-08-01"), donor: { name: "Private Donor", email: "private@example.com" } };
    const html = await render("equipment-discovery.ejs", {
        currentUser: { role: "ngo" }, organization: { name: "Mobility Trust" }, donations: [donation],
        equipmentTypes: ["wheelchair"], conditions: ["good"], filters: { equipment: "", condition: "", location: "" },
        total: 1, page: 1, totalPages: 1, filterQuery: ""
    });
    assert.match(html, /Verified NGO catalogue/);
    assert.match(html, /wheelchair/);
    assert.match(html, /<strong>3<\/strong> available/);
    assert.doesNotMatch(html, /Private Donor|private@example\.com/);
});

test("donation create form renders", async () => {
    const html = await render("donate.ejs", {
        equipmentTypes: ["wheelchair"], conditions: ["good"], donation: null, message: "",
        formTitle: "Create donation listing", formAction: "/donate", submitLabel: "Create listing"
    });
    assert.match(html, /multipart\/form-data/);
    assert.match(html, /name="_csrf" value="test-token"/);
});

test("NGO dashboard renders NGO navigation without donor actions", async () => {
    const html = await render("ngo-dashboard.ejs", {
        currentUser: { id: "ngo-id", name: "NGO Member", email: "ngo@example.com", role: "ngo" },
        user: { name: "NGO Member" }, organization: null, message: ""
    });
    assert.match(html, /NGO dashboard/);
    assert.doesNotMatch(html, /Donate equipment/);
    assert.doesNotMatch(html, /My donations/);
});

test("NGO organization onboarding and administrator review render securely", async () => {
    const organization = {
        _id: "507f1f77bcf86cd799439011", id: "507f1f77bcf86cd799439011", name: "Mobility Trust",
        registrationNumber: "NGO-102", contactPerson: "Asha Rao", contactEmail: "asha@example.org",
        phone: "+91 98765 43210", website: "https://example.org", description: "Mobility support for local communities.",
        address: { line1: "12 Community Road", city: "Pune", state: "Maharashtra", postalCode: "411001" },
        verificationStatus: "pending", submittedAt: new Date("2026-08-01"),
        verificationDocument: { filename: "private.pdf", originalName: "certificate.pdf" },
        owner: { name: "NGO Member", email: "ngo@example.org" }
    };
    const form = await render("organization-form.ejs", { currentUser: { role: "ngo" }, organization, message: "", formTitle: "Update pending organization", formAction: `/ngo/organizations/${organization.id}/edit`, submitLabel: "Save", requireDocument: false });
    assert.match(form, /multipart\/form-data/);
    assert.match(form, /name="verificationDocument"/);
    assert.match(form, /Private document storage/);
    const review = await render("admin-organization-review.ejs", { currentUser: { role: "admin" }, organization, message: "" });
    assert.match(review, /Open private verification document/);
    assert.match(review, /Mobility Trust/);
});

test("donor dashboard renders ownership actions only for available listings", async () => {
    const html = await render("donor-dashboard.ejs", {
        message: "", legacyDonations: [], donations: [{
            _id: "507f1f77bcf86cd799439011", equipment: "wheelchair", condition: "good", quantity: 1,
            description: "Maintained wheelchair", location: { city: "Pune", state: "Maharashtra", postalCode: "411001" },
            status: "available", images: [], createdAt: new Date("2026-01-01")
        }]
    });
    assert.match(html, /Edit/);
    assert.match(html, /Withdraw/);
});

test("authenticated pages render the shared CareCycle navigation", async () => {
    const home = await render("home.ejs", {});
    const about = await render("about.ejs", {});
    const contact = await render("contact.ejs", { message: "" });
    for (const html of [home, about, contact]) {
        assert.match(html, /CareCycle/);
        assert.match(html, /My donations/);
        assert.match(html, /Sign out/);
        assert.match(html, /Donate equipment/);
        assert.match(html, /Skip to main content/);
        assert.match(html, /accessibility\.js/);
    }
});

test("authentication pages expose skip navigation and live feedback", async () => {
    const login = await render("login.ejs", { message: "Please sign in" });
    const register = await render("register.ejs", { message: "Check your details" });
    for (const html of [login, register]) {
        assert.match(html, /href="#main-content"/);
        assert.match(html, /aria-live="polite"/);
        assert.match(html, /accessibility\.js/);
    }
});

test("administrator sign-in and operational dashboard are role-specific", async () => {
    const signIn = await render("admin-login.ejs", { message: "Authorized administrators only" });
    assert.match(signIn, /CareCycle Administration/);
    assert.match(signIn, /action="\/admin\/login"/);
    const dashboard = await render("admin-dashboard.ejs", {
        currentUser: { role: "admin" }, user: { name: "Administrator" }, message: "", pendingOrganizations: [], recentAudit: [], accessRequests: [],
        metrics: { userCount: 4, verifiedCount: 1, donationCount: 3, completedRequestCount: 1 }
    });
    assert.match(dashboard, /Operational oversight/);
    assert.match(dashboard, /Manage accounts/);
    assert.doesNotMatch(dashboard, /Donate equipment/);
});

test("identity portals expose separate participant and administration paths", async () => {
    const participant = await render("login.ejs", { message: "" });
    assert.match(participant, /Participant login/);
    assert.match(participant, /CareCycle admin/);
    assert.match(participant, /Create a donor or NGO account/);
    const administration = await render("admin-login.ejs", { message: "" });
    assert.match(administration, /Platform operations only/);
    assert.match(administration, /Request administrative access/);
    const request = await render("admin-access-request.ejs", { message: "" });
    assert.match(request, /will not create an account or grant privileges/i);
});

test("destructive forms use the accessible confirmation layer", async () => {
    const html = await render("donor-dashboard.ejs", { message: "", legacyDonations: [], donations: [{
        _id: "507f1f77bcf86cd799439011", equipment: "wheelchair", condition: "good", quantity: 1,
        description: "Maintained wheelchair", location: { city: "Pune", state: "Maharashtra", postalCode: "411001" },
        status: "available", images: [], createdAt: new Date("2026-01-01")
    }] });
    assert.match(html, /data-confirm=/);
    assert.doesNotMatch(html, /onsubmit="return confirm/);
});

test("forbidden browser access renders a role-aware recovery page", async () => {
    const html = await render("access-denied.ejs", {
        currentUser: { id: "ngo-id", name: "NGO Member", email: "ngo@example.com", role: "ngo" },
        message: "This resource belongs to another account.",
        dashboardPath: "/ngo/dashboard",
        role: "ngo"
    });
    assert.match(html, /Access denied/);
    assert.match(html, /\/ngo\/dashboard/);
    assert.match(html, /another account/);
});
