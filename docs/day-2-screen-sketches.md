# Day 2 screen sketches

October 11, 2026. Low-fidelity proposals for discussion, not screenshots of implemented workflows or evidence of user approval. All equipment/quantity examples are synthetic. Existing listing and request actions remain supported; pickup/handover elements below are planned for later stages.

## Donor workspace

```text
CareCycle       My listings | Requests | Sign out
My equipment listings                   [List equipment]

Requests awaiting a decision
Equipment | NGO | Requested quantity | [Review request]

Synthetic example: wheelchair, total 5
Reserved 2 | Remaining 3 | Acknowledged handover 0
[View listing]   [Request history]

Planned: collection commitments
NGO | Confirmed collection window | [View arrangement]
Planned: handovers awaiting NGO acknowledgement
Request reference | Actual quantity | Current next action
```

The quantity row expresses the future accounting contract. Today partial allocation can hide remaining units; it must be fixed before this row is presented as live behavior. Cancellation/edit controls must follow later lifecycle rules, not simply change status labels.

## NGO workspace and equipment detail

```text
CareCycle       NGO dashboard | Find equipment | Sign out
Organization review: pending / rejected / verified
If pending/rejected: [Edit profile] + reviewer explanation

Verified discovery:
[Category] [Condition] [Collection area] [Apply filters]
Equipment | Donor-described condition | Remaining quantity
[View listing]

Equipment detail:
Participant photos, or "No equipment photos supplied"
Category | Condition | Description | Quantity | Area
Planned fields: model, known defects, missing accessories
Verification concerns the NGO, not equipment fitness.
[Quantity] [Need summary without identifying details]
[Submit request]    or existing request status/history
```

Donor contact details remain out of discovery and pending-request screens. Accepted-request pages expose matched contacts. Detailed model/defect fields remain proposals until user needs and validation requirements are established.

## Planned collection and handover detail

```text
Request reference | Equipment | Accepted quantity | NGO
Participants only: collection window + time zone
[Propose window] [Confirm] [Reschedule]
[Cancel commitment with reason]

Donor handover:
[Actual quantity] [Equipment checklist] [Record handover]
State: awaiting NGO acknowledgement

NGO response:
[Acknowledge received quantity] [Report discrepancy]
State: partial / disputed / acknowledged
Next action and remaining commitment shown explicitly

After acknowledgement: [View recorded receipt]
History: actor, event, timestamp, reason, correction
```

Collection and handover must be independent for each accepted NGO request. A donor submission alone must not mark mutual completion. Actual quantity cannot exceed the accepted commitment; cancellation and repeated submissions must preserve accounting. Receipt copy must avoid medical certification and tax claims.

## Narrow-screen arrangement

Each row becomes a labelled card; actions follow the associated record. Filters stack vertically. Menu, sign-out, labels, errors, and primary actions remain keyboard reachable. Avoid horizontal table scrolling for essential tasks and avoid hiding state solely behind hover or color.
