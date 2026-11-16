# Phase 10: protected stock and consumption

This extension replaces timestamped manual parts evidence with transactional reservations **when an owner enables LEDGER mode**. MANUAL remains the default. Earlier blueprint examples are planning material; this record and the [implemented API contract](../api/phase-10-openapi.json) describe current behavior.

## Owner: establish opening stock

1. Start the existing local Compose stack and sign in as the Alpha owner using the local identity instructions. Open **Parts catalog** to create a part and a BRANCH or VAN location if needed.
2. Open **Stock ledger**, select the part/location, record an opening receipt or absolute physical count, and enter an attributable note. Quantities support three decimal places and nine integer digits. A missing balance is an uninitialized record, not proof that physical stock is zero.
3. Review existing manual commitments and opening counts. Enable ledger reservations and supply a mode review note. If manual assignments remain active, explicitly acknowledge that their stock is not protected. Resolve those commitments operationally before treating the new ledger as complete inventory coverage.
4. Refresh unassigned ready jobs and mark them ready again: changing inventory mode invalidates their prior preparation policy approval. Existing assignments retain their original MANUAL or LEDGER mode; enabling never retroactively allocates stock.

Owners enter receipts, signed corrections, returns against consumption and absolute physical counts. Each movement requires the observed balance version and a retry key. Stale submissions fail without overwriting stock; the UI keeps input for review. Physical counts cannot fall below reserved quantities. Returns must reference consumption for the same part/location, and cumulative returns cannot exceed that consumption. They do not recreate a job reservation.

## Dispatcher: protect required quantities

1. Add confirmed **REQUIRED** parts with quantity and location to a job. SUSPECTED parts remain warnings and are not reserved.
2. Review preparation, choose a qualified available technician and approve assignment. In LEDGER mode the server checks available stock and commits assignment, scheduling reservation, stock allocations, movements and audit together. Insufficient stock rolls the whole action back.
3. Two dispatchers competing for the last item cannot both allocate it. Writes use a company transaction lock; this coarse serialization favors pilot correctness over high-volume throughput.
4. Inspect **Stock allocations** in the job detail. Assigned preparation accounts for its own allocation and consumed quantity; stock held by another job is unavailable. Manual confirmations are not substitutes for ledger stock.

## Technician: consume and close

1. Open an assigned preparation card on desktop or mobile web. Acknowledge and start the visit.
2. Open **Stock allocations**. Record the actual quantity consumed and a note. Only an active, in-progress ledger assignment can consume its own protected quantity. This atomically reduces on-hand stock and reservations and advances the job version.
3. A lost response can be retried with the same key/payload without double deduction, including an authorized replay after closure. Changed payloads must use a new action; quantities cannot exceed allocation remaining.
4. Review actual consumption before closure and tick the mandatory inventory review confirmation. Closing releases unused reserved quantities, including when a linked follow-up draft is created. The follow-up copies requirements, not allocations or an assignment. Cancellation and pre-start rescheduling also release allocations; consumed stock stays deducted.

Reported usage in visit observations remains a non-accounting finding. It never deducts stock. AI evidence cannot create movements, consume stock, approve readiness or assign technicians. The technician experience is responsive online web, not a native or offline app.

## Reconciliation and operating boundaries

- Owners can inspect attributed movement history and run **Check ledger reconciliation**. It compares stored balances with movement sums, movement counts/balance versions and remaining active allocations in a consistent snapshot. The local endpoint supports up to 5,000 part/location balances.
- The application exposes no movement edit/delete operation. A database trigger blocks UPDATE. Privileged database maintenance can still delete records; this is not cryptographic immutability or protection from a database administrator. Movement sequence/count checks catch ordinary deletions and drift, not every coordinated privileged alteration.
- Unexplained ledger drift blocks affected writes and mode activation. Stop operations, preserve evidence, inspect the cause and use controlled operator recovery. A physical count is a new accountable movement, not an endpoint for overwriting a broken ledger. Bookkeeping agreement does not prove physical truth.
- Finish or release active ledger assignments before disabling ledger mode. Historical ledger visits retain their mode and consumption records.
- Encrypted backup/restore rehearsals now verify stock counts, ledger sums, versions and allocation agreement after restoration. Hosted offsite backup/key custody and AWS remain separate uncompleted gates.
- Transfers, purchasing, supplier integration, automatic van custody, costing and external-system sync are not implemented. A live vendor adapter needs an actual partner, access and agreed identifiers, conflict/ownership and retry rules; adding a fake adapter would not establish integration.

See the [verification record](../plans/phase-10-checklist.md). Local correctness and browser evidence do not establish customer adoption or production readiness.
