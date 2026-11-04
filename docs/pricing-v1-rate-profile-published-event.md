# Pricing v1 rate-profile-published event

Decision source: SCRUM-357  
Schema version: 1

## Wire identity

- Type: `vistay.booking.rate-profile-published`
- Topic: `vistay.booking.rate-profile-published.v1`
- Producer: Booking
- Aggregate ID and Kafka key: authoritative `propertyId`
- Aggregate version: monotonic per-property `publicationRevision`
- Payload schema:
  [`booking.rate-profile-published.payload.schema.json`](../events/v1/booking.rate-profile-published.payload.schema.json)
- Envelope schema:
  [`booking.rate-profile-published.event.schema.json`](../events/v1/booking.rate-profile-published.event.schema.json)

The event is an append-only fact that an immutable authored profile passed publication
approval. It is suitable for active-pricing cache invalidation and owned projections;
it is not a quote, booking, price total, or authorization grant.

## Ordering and delivery

Booking inserts the publication, audit row, and outbox row in one database transaction.
The outbox publishes at least once. API success can precede Kafka delivery.

All events for one property use `propertyId` as the record key. Envelope
`aggregateVersion` and payload `publicationRevision` must be equal. A consumer:

1. validates the complete envelope and payload;
2. deduplicates durably by `eventId`;
3. rejects a repeated event ID with a different payload hash;
4. applies only a revision newer than its owned projection; and
5. reconciles a gap through the Booking-owned publication read API rather than
   another service's database.

Out-of-order arrival is expected. Arrival time and `publishedAt` do not replace
aggregate-version ordering.

## Gap reconciliation API

An internal consumer that observes a revision gap calls the versioned
`PricingPublicationReconciliationService.ReconcilePricingPublications` gRPC API.
The request is scoped to one `propertyId` and supplies the last durably applied
publication revision. The response returns the current property head and the next
ascending revision page, including the immutable profile evidence used to create
each publication. Consumers advance their cursor only through the returned
`nextAfterPublicationRevision` and continue while `hasMore` is true.

Page size zero selects the server default of 50; positive sizes are bounded at 100.
The head and page are read from one repeatable database snapshot. An empty history
returns head revision zero rather than conflating an unpublished property with a
transport failure.

This API is service-to-service only. Booking requires an explicit bounded deadline,
mutual TLS with an allow-listed SPIFFE URI, and a pricing-reconciliation caller
allow-list. It does not accept an end-user identity or widen a caller to another
property within a response.

## Payload semantics

`publicationId` identifies immutable approval evidence. `previousPublicationId` is
the property publication head accepted by compare-and-set and is null only for the
first publication. `rateProfileVersionId` and `profileVersion` identify the immutable
authored input. `snapshotSchemaVersion` and `profileFingerprint` allow consumers to
invalidate or compare caches without receiving the complete pricing snapshot.

`effectiveFrom` and nullable `effectiveToExclusive` describe the profile's half-open
effective interval. They do not by themselves choose the active profile: the
normative selector also evaluates full-stay coverage and overlap precedence from
[`pricing-v1-publication-and-snapshots.md`](pricing-v1-publication-and-snapshots.md).

The event contains no customer PII, price totals, manual override evidence, or
credentials. Consumers needing a complete profile use an authorized versioned API.
