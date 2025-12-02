# **Mod Spec: Cash Session & Reconciliation — Capstone 1 (Final Revision)**
## **Purpose**
Ensure accurate, auditable handling of cash per register and shift, without slowing the cashier workflow.

Each register (terminal) has one active cash session, opened with a float and closed with a counted balance.

Integrates with **Sales**, **Policy**, **Reporting**, **Receipts**, and **Activity Log**.

## **Operational Model – Per Register**
- Each branch can have one or more **registers** (terminals/devices).
- Each register represents one physical cash drawer.
- Exactly **one OPEN session per register** at a time.
- A cashier must **start a session with an opening float** before selling.
- Managers/Admins may **take over** if a session was left open.
- Other users can still record non-cash sales (QR or digital) without an open session.

## **Policies (Tenant Admin → Money Handling Rules)**

|**Policy**|**Default**|**Description**|
| :-: | :-: | :-: |
|Require open register before accepting cash|✅ ON|Prevents unaccounted cash sales. UX gates before Sale screen.|
|Paid-out limit USD/KHR|0|Limit petty cash per shift.|
|Require manager approval for over-limit paid-outs|✅ ON|Adds approval for large withdrawals.|
|Require manager approval for cash refunds|✅ ON|Protects against improper refunds.|
|Allow manual cash adjustments|🚫 OFF|Keep audit clean for Capstone 1.|

## **Roles & Permissions**
- **Admin:** Manage any register/session; approve refunds & paid-outs; post adjustments; export reports.
- **Manager:** Open/close/take over sessions in branch; approve movements.
- **Cashier:** Start own register session; perform Paid In/Out (within limit); close session.
- **System:** Auto-link sales cash to active session; enforce rules; compute expected cash.

## **Session Lifecycle**

### **1️⃣ Start Session (Pre-Sale Prompt)**
- Cashier taps **Sale** → if no open session:

shows **Start Session modal** with inputs:

- Opening Float USD / KHR
- Optional Note
- Button **Start Session**
- On confirm → session opens → navigate to **Menu**.
- No hard block; the user never reaches checkout without a session.
- Activity: CASH\_SESSION\_OPENED.

### **2️⃣ Normal Selling**
- Sales attach to the active register session.
- actor\_id on each movement keeps per-user traceability.
- Non-cash sales allowed even without a session.

### **3️⃣ Take Over (Manager/Admin)**
- If a session is still OPEN under another user:

prompt **“Previous session left open by [Name]”**.

Manager enters reason → system auto-closes old session (closed\_by = manager) → opens new one.

- Activity: CASH\_SESSION\_TAKEN\_OVER.

### **4️⃣ Manual Movements (while OPEN)**

|**Type**|**Description**|**Roles**|
| :-: | :-: | :-: |
|**Paid In**|Add cash to drawer. Increases expected cash.|Cashier+|
|**Paid Out**|Petty cash. Over-limit → pending approval.|Cashier≤limit; Mgr/Admin any|
|**Adjustment**|Manual correction (OFF default).|Mgr/Admin only|

All require a reason (3–120 chars). Only OPEN sessions accept movements.

### **5️⃣ Close Session**
- Input: Counted USD/KHR, optional note.
- System computes expected vs counted → variance.
- Status: CLOSED (or PENDING\_REVIEW).
- Activity: CASH\_SESSION\_CLOSED.
- Manager may review and approve (APPROVED).
- Blockers (Pending Paid Out, unsynced sales) → warning dialog but no forced kick.

## **Shift Handling Behavior**
- **No auto-close or auto-logout at shift end.**

Sessions stay OPEN until user closes manually.

- Gentle reminder appears (~30 min after shift end):

“Your shift ended at 18:00. Close the register when you’re done.” → buttons **Close Now / Remind Later**.

- **Out-of-shift start:** show banner (“You’re outside your assigned shift”) but allow session to start.

Optional manager-approval request (SHIFT\_OVERRIDE\_REQUESTED) if policy enabled.

## **Reports**
- **X Report:** live summary of the open register.
- **Z Report:** closure summary (opening, sales, refunds, paid in/out, variance).
- **Daily Cash Summary:** aggregates all register Zs per branch/day.
- Each report includes per-user subtotals from movement actor\_ids.

## **Data Model (additions)**

**cash\_registers**

id, tenant\_id, branch\_id, name, status('ACTIVE','INACTIVE') 

**cash\_sessions**

id, tenant\_id, branch\_id, register\_id,\
opened\_by, opened\_at,\
opening\_float\_usd, opening\_float\_khr,\
status('OPEN','CLOSED','PENDING\_REVIEW','APPROVED'),\
closed\_by?, closed\_at?,\
expected\_cash\_usd/khr, counted\_cash\_usd/khr, variance\_usd/khr,\
note 

**cash\_movements**

id, tenant\_id, branch\_id, register\_id,\
session\_id, actor\_id,\
type('SALE\_CASH','REFUND\_CASH','PAID\_IN','PAID\_OUT','ADJUSTMENT'),\
status('APPROVED','PENDING','DECLINED'),\
amount\_usd, amount\_khr, ref\_sale\_id?, reason, created\_at 

Unique partial index → one OPEN per (tenant, register).

## **Offline Behavior**
- Sessions and movements queued in IndexedDB; synced idempotently on reconnect.
- Duplicate OPEN detection handled on sync (Manager resolves via Take Over).

## **Security & Audit**
- Full RBAC + branch/register scoping.
- Activity Log events:

CASH\_SESSION\_OPENED, CASH\_SESSION\_TAKEN\_OVER, CASH\_SESSION\_CLOSED, CASH\_PAID\_IN, CASH\_PAID\_OUT, CASH\_REFUND, CASH\_ADJUSTMENT.

- (Optional) SHIFT\_INFO\_NOTICE for sales outside shift window.
- Write rate-limit 10 req/min/user.

## **UI Flow (Simplified Mobile)**

**Home (Cashier)**

- **Sale** card → “Start Session” modal if none open.
- **Paid In / Paid Out / X Report / Close Session** cards (enabled when open).
- Header pill: Register: Front Counter • Open • $20 float.
- Gentle post-shift reminder banner.

**Take Over flow (Manager)**

“Previous session left open by [Name]. Enter reason to take over.” → close old, open new.

## **Examples**

**Normal Day**

1. Cashier taps Sale → Start Session ($20 float).
1. Makes cash sales $85 + KHR 40 000, Paid Out $5.
1. Closes with counted $100 / KHR 40 000 → variance 0 → Z Report.

**Forgot to Close**

1. Next morning Manager logs in. Prompt: “Register open by Cashier A.”
1. Manager taps Take Over → reason “Forgot to close.” System auto-closes old, opens new.

**Out-of-Shift Start**

Cashier starts session at 08:20 though shift is 10:00–18:00. Banner shows “Outside shift; notify manager.” Sale allowed.

## **Out of Scope (Phase 2+)**
- Hardware drawer integration (open/close signals).
- Multiple concurrent sessions per register.
- Partial handover sessions.
- Auto anomaly alerts & photo receipts.

### **✅ Summary**

Modula’s Capstone-1 cash management now mirrors commercial best practice:

- **Per-register session model** (one drawer = one session).
- **No hard blocks**; cashiers are prompted to start a session before selling.
- **No auto-kicks**; only gentle post-shift reminders.
- Full traceability by register and actor with manager takeover control.
