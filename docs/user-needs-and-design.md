# Day 2 user needs and design decisions

Date: October 11, 2026. Status: provisional design decisions implemented; participant feedback pending.

## Evidence and research status

The project owner confirmed on October 11, 2026 that no donor/NGO feedback or promotional-image source/permission evidence is available yet. This is a statement about evidence availability, not a usability interview. No interviews, participant endorsements, or measured outcomes are claimed.

The Day 1 source review and the roadmap's UI audit identify product constraints and interface issues. Those are engineering observations, not research findings. Maintain a dated record for each future conversation, with consent to retain anonymized notes. Do not collect identifying beneficiary details, private verification documents, or equipment-related medical histories for this research.

## Short donor interview

1. Tell us about the last time you tried to give away medical equipment. What was difficult?
2. What details could you provide about condition, faults, accessories, quantity, and photos?
3. What would you need to know about an NGO before accepting its request?
4. Who would arrange collection, and what would happen if plans changed?
5. What record would you want after transfer? What would make that record useful?

## Short NGO interview

1. How do you currently find donated equipment, and what information determines whether you request it?
2. Which faults, missing parts, dimensions, or model details matter for your work?
3. What organization evidence could you provide, and what should reviewers explain about verification?
4. How do you handle collection timing, transport, partial quantities, and missed pickups?
5. How would you acknowledge receipt or report a discrepancy without identifying a beneficiary?

Ask participants to describe past behavior before presenting the [screen sketches](day-2-screen-sketches.md). Afterwards, ask them to locate the next action and explain what they expect it to do. Record confusion as observed behavior, not agreement inferred from silence.

## Assumptions and provisional choices

| Open assumption | Provisional decision and scope effect | Validation needed |
|---|---|---|
| Donors can describe equipment more usefully than a stock photo can. | Replace the homepage stock listing-like card with a listing-information guide. Keep participant-uploaded images. | Ask donors which details they can supply; Day 17 fields remain provisional. |
| NGO verification may be confused with equipment inspection. | Explain that review concerns organization evidence and does not certify equipment condition or medical fitness. | Ask NGOs and donors to explain verification in their own words. |
| Participants need a concrete next action more than decorative content. | Keep role-specific action links; replace vague copy, avatar circles, glyph decorations, and motion with readable text. | Observe each role locating its next task. |
| Collection changes and receipt discrepancies need a history. | Sketch per-request pickup and two-party handover states; do not advertise them as implemented. | Validate proposers/confirmers and partial-handover rules before Days 9 to 12. |
| A readable green/neutral interface is appropriate. | Solid surfaces, rectangular controls, modest rectangular status labels, native scrolling and immediate navigation. | Desktop/mobile and keyboard checks now; fuller accessibility review Day 18. |

Missing feedback does not expand release scope. Government portals, payments, full hospital inventory, and multi-member organizations remain excluded. No new equipment fields, handover endpoints, or public guest routes were introduced in Day 2.

## Visual and content direction

Lead with medical-equipment donation, the two participant roles, and available actions. Show equipment details and recorded states where records exist. Keep the existing green/neutral identity, text labels, visible focus indicators, native pointer behavior, and reduced-motion support. No fictional impact statistics, reviews, avatars, endorsements, emoji icons, AI badge, custom cursor, generated filler images, decorative gradients, floating motion, or navigation delays are used.

Homepage guidance is explicitly not a listing. Current copy distinguishes request acceptance from future pickup and acknowledged handover. Contact copy describes optional email delivery rather than promising a response or claiming information never leaves the platform. About actions now lead each role to an authorized destination. Authored legacy-history punctuation was changed without rewriting user-entered content.

## Future feedback record template

```text
Date:
Participant role and anonymous reference:
Consent and note-retention agreement:
Question or task:
Observed behavior / actual feedback:
Interpretation (separate from observation):
Design or scope change:
Unresolved question:
```

See [asset inventory](promotional-assets.md) and [implementation/verification record](day-2-verification.md). User interviews remain pending and should be revisited before equipment-field and handover decisions become final.
