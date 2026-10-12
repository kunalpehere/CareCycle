import test from "node:test";
import assert from "node:assert/strict";
import { validateDonation } from "../src/validators/input.js";
import { Donation } from "../src/models/Donation.js";
import ejs from "ejs";
import path from "node:path";

const body = { equipment: "wheelchair", quality: "good", quantity: "3", description: "Synthetic folding wheelchair", city: "Pune", state: "Maharashtra", postalCode: "411001" };

test("optional details validate only selected specifications and ignore forged nested data", () => {
    const result = validateDonation({ ...body, brand: "Synthetic Brand", functionalStatus: "partly_working", wheelchair_spec_seatWidthCm: "42.5", wheelchair_spec_folding: "yes", stethoscope_spec_tubingCondition: "invalid", details: { brand: "forged" } });
    assert.equal(result.valid, true); assert.equal(result.value.details.brand, "Synthetic Brand");
    assert.deepEqual(result.value.details.specifications, { seatWidthCm: 42.5, folding: "yes" });
    const switched = validateDonation({ ...body, equipment: "cane", wheelchair_spec_seatWidthCm: "5000", wheelchair_spec_folding: "yes", cane_spec_heightAdjustable: "unknown" });
    assert.equal(switched.valid, true); assert.deepEqual(switched.value.details.specifications, { heightAdjustable: "unknown" });
    assert.equal(validateDonation(body).value.details.functionalStatus, "not_checked");
    for (const equipment of ['constructor', '__proto__', 'unknown']) assert.equal(validateDonation({ ...body, equipment }).valid, false);
});

test("field errors preserve bounded scalar entries and reject malformed submitted values", () => {
    const invalid = validateDonation({ ...body, quantity: "0", brand: "x".repeat(81), model: ["forged", "value"], functionalStatus: "certified", wheelchair_spec_seatWidthCm: "42.55", description: '<script>synthetic</script>' });
    assert.equal(invalid.valid, false);
    for (const key of ['quantity','brand','model','functionalStatus','wheelchair_spec_seatWidthCm']) assert.ok(invalid.errors[key]);
    assert.equal(invalid.draft.description, '<script>synthetic</script>'); assert.equal(invalid.draft.model, '');
    assert.equal(validateDonation({ ...body, defects: "x".repeat(2000) }).draft.defects.length, 1000);
});

test("model contracts keep old records optional and reject mismatched category specifications", async () => {
    const values = validateDonation(body).value;
    const donor = '507f1f77bcf86cd799439011';
    const legacy = new Donation({ ...values, donor, details: undefined });
    await legacy.validate(); assert.equal(legacy.details, null);
    const invalid = new Donation({ ...values, donor, equipment: "cane", details: { specifications: { seatWidthCm: 42 } } });
    await assert.rejects(invalid.validate(), /selected category/);
});

test("older detail displays are honest and participant text stays escaped", async () => {
    const render = donation => ejs.renderFile(path.resolve('views/partials/equipment-details.ejs'), { donation });
    assert.match(await render({ equipment: 'cane' }), /Not provided/);
    const html = await render({ equipment: 'wheelchair', details: { brand: '<script>synthetic</script>', functionalStatus: 'working', specifications: { seatWidthCm: 42 } } });
    assert.match(html, /Reported working/); assert.match(html, /&lt;script&gt;/); assert.ok(!html.includes('<script>'));
});
