# Inventory v1 management query

Status: approved for SCRUM-536
Owner: Booking Service
Consumers: Admin Web and Admin Mobile

## Purpose and ownership

`inventoryBlocks` is the branch-scoped operational read used to review current and
historical exact-unit blocks before creating or releasing an operator-owned block.
Booking owns the rows and the monotonic `inventoryRevision`. Property owns the
exact-unit-to-branch membership used for authorization. User owns the
`inventory:read` grant and data partition.

The query never reads another service database. Booking resolves authorization
and Property membership before querying its own projection and fails closed when
either dependency is unavailable.

## GraphQL contract

```graphql
type Query {
  inventoryBlocks(input: InventoryBlockManagementInput!): InventoryBlockManagementPage!
}

input InventoryBlockManagementInput {
  propertyId: ID!
  fromDate: String
  toDateExclusive: String
  types: [InventoryBlockType!] = []
  statuses: [InventoryBlockStatus!] = []
  first: Int = 50
  after: String
}

type InventoryBlockManagementPage {
  nodes: [InventoryBlockManagementNode!]!
  pageInfo: InventoryBlockPageInfo!
  inventoryRevision: String!
  branchId: ID!
  propertyMembershipVersion: String!
}

type InventoryBlockManagementNode {
  inventoryBlockId: ID!
  propertyId: ID!
  type: InventoryBlockType!
  status: InventoryBlockStatus!
  startDate: String!
  endDateExclusive: String!
  reason: String
  channelProvider: String
  blockVersion: String!
  createdAt: String!
  updatedAt: String!
  releasedAt: String
}

type InventoryBlockPageInfo {
  hasNextPage: Boolean!
  endCursor: String
}
```

Existing `InventoryBlockType` and `InventoryBlockStatus` enums are reused.

## Deterministic behavior

- `propertyId` is a canonical lowercase UUID.
- Date filters are optional. When both exist, `toDateExclusive` must be after
  `fromDate`. A row overlaps the half-open filter when
  `endDateExclusive > fromDate && startDate < toDateExclusive`.
- Empty type/status arrays mean all values. Duplicate or unknown values fail.
- `first` is 1-100, default 50.
- Ordering is `updatedAt DESC, inventoryBlockId DESC`.
- `after` is an opaque, canonical URL-safe base64 cursor containing only the
  last ordering key. Malformed or noncanonical cursors return
  `INVALID_INVENTORY_CURSOR`.
- The page and `inventoryRevision` are read in one repeatable-read transaction.
  A later mutation changes the revision; clients refresh from page one rather
  than combining pages from different revisions.

## Authorization and privacy

The action is `inventory:read`. SUPER_ADMIN and CTV may use an ALL grant;
MANAGER, RECEPTIONIST, and STAFF require the exact current BRANCH partition.
Property-not-found, unmapped membership, stale authorization, and dependency
outage fail closed using the existing inventory error contract.

The response intentionally excludes booking/hold/customer/guest identity,
channel external references, actor account/profile IDs, authorization evidence,
commercial amounts, credentials, and database details. `reason` is operational
inventory detail covered by `inventory:read`; public/customer APIs must not
reuse this shape.

## Errors

- `UNAUTHENTICATED`
- `INVENTORY_READ_FORBIDDEN`
- `INVALID_INVENTORY_MANAGEMENT_INPUT`
- `INVALID_INVENTORY_CURSOR`
- `PROPERTY_NOT_FOUND`
- `PROPERTY_PARTITION_UNMAPPED`
- `PROPERTY_PARTITION_UNAVAILABLE`
- `AUTHORIZATION_UNAVAILABLE`
- `INVENTORY_MANAGEMENT_UNAVAILABLE`

Errors do not echo input, SQL, dependency addresses, tokens, or protected data.
