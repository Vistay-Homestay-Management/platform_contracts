# Roadmap and historical epic traceability

The detailed backlog-generation baseline is `ViStay_Epic_Roadmap_2026_Finalized.txt` in the workspace's `service context` directory. The former `ViStay_Epic_List_Standardized.txt` remains unchanged as historical input.

## Release sequence

| Release | Epics | Outcome |
| --- | --- | --- |
| Release 0 | 00–01 | Approved business/vendor/compliance decisions and an executable Backoffice walking skeleton. |
| Release 1 | 02–04 | Backoffice identity, secure media, and trustworthy property/supply contracts. |
| Release 2 | 05–08 | Pricing, exact-unit inventory, booking requests, quote/hold/reservation. |
| Release 3 | 09–13 | Manual finance, owner settlement, compliant stays, operations, and notifications. |
| Release 4 | 14–15 | Channel Manager integration and a recoverable real-data pilot. |
| Post-pilot | 16–22 | Host and Customer portals, analytics, employee integration, and production HA/DR. |

## Final epic index

| Epic | Name |
| --- | --- |
| 00 | Business Rules, Compliance & Vendor Readiness |
| 01 | Platform Baseline & Executable Walking Skeleton |
| 02 | Backoffice Identity, RBAC, Profile & Account Lifecycle |
| 03 | Secure Media & Documents |
| 04 | Property, Parties & Supply Contracts |
| 05 | Pricing & Rate Rules |
| 06 | Unified Inventory & Availability |
| 07 | CRM, Booking Requests & Attribution |
| 08 | Quote, Hold & Reservation Lifecycle |
| 09 | Billing, Deposits & Manual Payments |
| 10 | Owner Settlement & Finance Dashboard |
| 11 | Stay, Access & Guest Compliance |
| 12 | Assets, Inspections, Work Orders & Readiness |
| 13 | Notifications & Operational Alerts |
| 14 | Channel Manager Integration |
| 15 | Cutover & Pilot Readiness |
| 16 | Host Identity & Profile |
| 17 | Host Property, Contract & Finance |
| 18 | Customer Identity & Profile |
| 19 | Customer Search, Booking & Payment |
| 20 | Data Warehouse & Advanced Analytics |
| 21 | External Employee System Integration |
| 22 | Production HA, Scale & Disaster Recovery |

## Old-to-new mapping

| Historical epic | Final epic(s) | Notes |
| --- | --- | --- |
| 01 Project Skeleton & Database Foundation | 00, 01, 15, 22 | Separates decisions, executable baseline, pilot readiness, and post-pilot HA/DR. |
| 02 Admin Authentication & Authorization | 02 | Backoffice identity and RBAC. |
| 03 Admin Personal Account & Profile | 02 | Combined with the same identity lifecycle. |
| 04 Admin Property & Contract Management | 03, 04, 05, 10 | Secure documents, effective supply terms, pricing, and settlement are distinct owners. |
| 05 Admin Booking Management | 05, 06, 07, 08, 09, 11, 12 | Decomposed around pricing, inventory, request, reservation, finance, stay, and operations invariants. |
| 06 Admin Asset & Operations Management | 03, 06, 12, 21 | Media, inventory block requests, internal operations, and future external dispatch. |
| 07 Admin Customer & Host Management | 02, 04, 07, 16, 18 | Separates Backoffice permissions, party/supply links, CRM, and later portal identities. |
| 08 Admin Finance Management & Dashboard | 09, 10, 20 | Operational ledger, settlement/dashboard, and advanced analytics. |
| 09 Admin Account Provisioning & Lifecycle | 02, 16, 18 | Separate realm lifecycles. |
| 10 Admin System & Business Parameters | 00, 05, 08, 09, 12, 13 | Decisions first; runtime configuration remains with the owning domain. |
| 11 Admin UI Polish | Common DoD for 01–15 | UX quality is not deferred to a cleanup epic. |
| 12 Host Authentication & Authorization | 16 | Post-pilot Host realm. |
| 13 Host Personal Account & Profile | 16 | Same Host identity/profile outcome. |
| 14 Host Property & Assets | 17 | Scope-derived Host read model. |
| 15 Host Contracts & Financial Overview | 17 | Contract and settlement views share the Host scope. |
| 16 Host UI Polish | Common DoD for 16–17 | UX quality is part of each feature. |
| 17 Customer Authentication & Authorization | 18 | Post-pilot Customer realm and self-registration. |
| 18 Customer Personal Account & Profile | 18 | Same Customer identity/profile outcome. |
| 19 Customer Search & Booking | 05, 06, 08, 09, 19 | Shared domain capabilities precede the Customer journey. |
| 20 Customer UI Polish | Common DoD for 18–19 | UX quality is part of each feature. |
| 21 Notification Integration | 13 | In-app, email, push, and GraphQL SSE. |
| 22 OTA Integration | 00, 14 | Vendor/API proof is separated from implementation. |
| 23 Data Warehouse & Analytics | 20 | Post-pilot analytical platform. |
| 24 Operational Task Dispatch & Employee Integration | 00, 12, 21 | Contract readiness, internal operations, then verified external integration. |

## Deliberate additions

- Epic 03 makes media/document security and lifecycle a reusable capability.
- Epic 11 makes all-occupant guest compliance, sensitive-document controls, and retention an explicit outcome.
- Epic 15 makes minimal-data cutover, reconciliation, backup/restore, and pilot support objective release gates.
- Epic 22 defers production HA and scale until pilot evidence and business SLOs exist.
