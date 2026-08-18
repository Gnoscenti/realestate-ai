# Closed/Sold data import

The `/cma` workspace accepts a CSV exported from a source the signed-in user is
authorized to use. It does not scrape public listing sites. Accepted rows are
stored in Postgres in `sold_comps`, scoped to the authenticated user's workspace
and linked to a content-addressed source record in `sold_comp_sources`.

## Required data

Every accepted row must contain:

- a Record Key, Listing Key, or MLS Number;
- an exact `Closed` or `Sold` status;
- a full address, either as a quoted `Street, City, State ZIP` field or separate
  Street Address, City, and State fields;
- Close Price greater than zero;
- Close Date (`YYYY-MM-DD` or `MM/DD/YYYY`);
- Living Area as a positive whole number; and
- Property Type.

Every import also requires a stable dataset/MLS-board namespace and source as-of
date. The namespace is included in the persisted canonical key, so the same raw
ListingKey from two boards cannot overwrite another board's record. The original
key remains visible in previews and record lists.

The importer also requires the signed-in user to affirm that they are authorized
to use the export. The source row records the importing user and timestamp; this
attestation does not replace the owner's vendor/license review.

Common RESO and export aliases are mapped explicitly. Active, Pending, malformed,
and incomplete rows are rejected with logical CSV row numbers and field-level
reasons. The importer never supplies a default status, price, date, address,
living area, or property type.

Limits are 2 MB and 5,000 data rows per file. A repeat upload is idempotent by
`(workspace_id, record_key)`: existing records are refreshed and never duplicated.
The same CSV content, dataset namespace, and as-of date reuse the same source ID.
That source row is immutable: re-uploading the snapshot under a different filename
or provider label does not rewrite its original provenance. Delete the source and
import again only when an original metadata entry itself was incorrect.

Conflict updates are freshness-ordered. A row's explicit Source Updated At value
is authoritative; when it is absent, the import's source as-of date is used.
Older rows are retained as source history but cannot replace a newer persisted
record. Equal timestamps use the content-addressed source ID as a deterministic
tie-break, so final state does not depend on upload order.

## Analysis boundary

These rows are labelled **Closed/Sold records**, not comparable sales. The app
does not rank them, calculate adjustments, estimate property value, or recommend
a price. Those features remain gated until a transparent subject-matching and
broker-reviewed adjustment workflow is implemented.

## External production gates

CSV import still requires the owner to confirm the MLS/vendor export license and
permitted retention/use. A direct RESO connection additionally requires:

1. the selected MLS vendor and authorized dataset;
2. credentials issued for this application and user population;
3. the provider's replication, display, retention, deletion, and audit terms;
4. a field mapping verified against that provider's RESO metadata; and
5. a broker/compliance decision on client-facing analysis and record retention.

Do not advertise live MLS/RESO coverage until those gates are complete and an
end-to-end production sync has been verified.
