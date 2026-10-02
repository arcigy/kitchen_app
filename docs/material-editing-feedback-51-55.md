# Material editing and support reports 51–55

## Owners and behavior

- Material selection and keyboard commands belong to `materialsPhasePanel` and
  `materialAssignmentEditor`. A typed assignment transaction uses the existing
  Materials endpoint, tenant checks and revision guard. Copy carries the captured
  product and price; destination demand, drawer height and appliance classification
  stay with the destination. Delete clears the assignment. Undo restores its exact
  prior state, including an inherited scoped assignment. Text input shortcuts remain
  native. Restoring another project invalidates queued commands and stale responses.
- Partial drawer runner prices use the existing margins calculation. The UI shows
  the priced subtotal with an exclamation mark when another variant has no price.
- Reports 51–52 use the existing custom furniture entities, renderer, drawing tools,
  BOM and editor history. A dimensional board or accepted rectangle becomes a real
  board with an explicit product and independently editable edges. An abandoned
  empty sketch never enters the save projection.
- Report 53 explains the existing purchase calculation. Materials shows net worktop
  area separately from whole or half stock area and its cost. A backsplash with no
  geometry explains why it has no billed amount and offers the existing creation
  tool from Materials and Margins.
- Report 54 uses the existing margin settings and pricing owner. Construction labor
  is a percentage of the selling price before project additional/construction labor,
  excluding appliances. Supplier appliance metadata and the component's explicit
  appliance checkbox exclude that item. A missing product price marks the basis
  preliminary. Existing projects default to zero. The fee is charged once.
- Report 55 uses the shared supplier target contract and response validator. Accessory
  categories request hardware instead of boards and retain their own component type
  and captured price. Supplier Bridge 0.3.18 includes the updated shared validator.

## Verification

Focused tests cover mixed runner heights, all four independent assignment identities,
clipboard compatibility and history, stale revisions, tenant boundaries, board BOM
and banding, stock purchase area, appliance exclusion and each accessory price.
The required `test:ui-regression` chain includes `test:materials-feedback-ui`, which
checks real Ctrl/Command shortcuts, dimensional and directly drawn boards, empty
sketch cancellation, persisted construction percentage, encrypted FQP roundtrip
and zero console errors. `MANUAL_TEST_LOG.csv` contains the user journeys.

The historical reports lack a complete original catalog and source revision bundle.
Their downloaded snapshots and screenshots inform the repair, while regression
fixtures remain synthetic and isolated. For report 53, the snapshot contains an
assigned backsplash product but no backsplash boards. The repair adds an explanation
and creation route; it does not invent customer geometry or its price.

## Supplier Bridge update

Web deployment cannot replace an extension already installed in Chrome. Build the
updated production extension for the maintained public origins:

```sh
SUPPLIER_BRIDGE_ARCIGY_ORIGINS='https://app.arcigy.com,https://app.arcigy.cloud,https://arcigy-kitchen-develop.178.104.175.242.sslip.io' npm run build:production
```

Replace the existing unpacked extension with `dist-production`, then reload it in
`chrome://extensions` and reopen the Arcigy/supplier tabs. Confirm version 0.3.18.
Do not use a debug build in production. Supplier cart, order and account actions
are outside this workflow.
