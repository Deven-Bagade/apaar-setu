# APAAR-Setu

**APAAR ID-based Student Data Management and Verification Platform for AICTE-approved institutions**
Smart India Hackathon · Problem Statement **SIH26263** · AICTE / MoE Innovation Cell

> Every seat accounted for. Every student verifiable.

APAAR-Setu turns AICTE's yearly headcount into a live, fraud-resistant **Seat Ledger**: each admitted student is one verified APAAR ID holding one approved seat, and any record can be verified in seconds by anyone the student consents to.

Built with **React + Vite**, and **Firebase (Auth + Cloud Firestore) on the free Spark plan**. It also runs with **zero setup in Demo mode** (data stored in the browser), so you can present it anywhere, even offline after the first load.

---

## 1. Run it in 2 minutes (Demo mode, no accounts needed)

Requirements: Node.js 18 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173 → **Sign in** → click any demo account card. All demo passwords are `Demo@1234`.

| Role | Email | What to show |
| --- | --- | --- |
| AICTE Admin | admin@aicte.demo | National dashboard, India map, Radar, audit chain, rules, users |
| Regional Officer (Western) | west.ro@aicte.demo | Region-only view, verify batches, inspection planner |
| Regional Officer (Northern) | north.ro@aicte.demo | Ganga IT's late batch and declared-vs-verified gap |
| Institution Admin (Sahyadri IT) | principal@sahyadri.demo | Seat Ledger, sign & submit batches, certificates, trust score |
| Data Clerk (Sahyadri IT) | clerk@sahyadri.demo | Excel upload with pre-validation, fixing rejected rows |
| Institution Admin (Ganga IT) | director@ganga.demo | A college with problems: flags, scholarship issues |
| Student | student@apaar.demo | Own record, signed credential + QR, consent, access log |
| Verifier (Employer) | hr@navyug.demo | Verify certificate QR, request consented access |
| Verifier (Regulator) | officer@nba.demo | Already-granted consent |

"Reset demo data" on the sign-in page rebuilds the dataset at any time.

### Build for production
```bash
npm run build      # output in dist/
npm run preview    # serve the build locally
```

---

## 2. Switch to Firebase (free Spark plan)

1. Go to https://console.firebase.google.com → **Add project** (no billing needed).
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**
3. **Build → Firestore Database → Create database** (production mode, region `asia-south1` Mumbai).
4. **Project settings → Your apps → Web (`</>`)** → register an app → copy the config.
5. Copy `.env.example` to `.env` and fill the six `VITE_FIREBASE_*` values.
6. Deploy the security rules (one time):
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add          # pick your project
   firebase deploy --only firestore:rules
   ```
7. `npm run dev`. The app detects an empty project and shows **Set up your Firebase project**. Choose **Lite** (8 colleges, about 2,800 writes) and click **Initialise database**. This creates all demo sign-in accounts and writes the dataset.
8. Sign in with any demo account.

**Free tier notes.** Spark gives 50,000 reads and 20,000 writes per day. An admin page load reads about 1,000–2,000 documents (Lite: about half). Large collections (ledger, audit) are loaded on demand by their pages. Use the **⟳ Refresh** button in the top bar to re-read data. Student and verifier consent screens update live.

### Deploy free on Firebase Hosting
```bash
npm run build
firebase deploy --only hosting
```
(Netlify / Vercel / GitHub Pages also work: it is a static single-page app; add an SPA rewrite to `index.html`.)

---

## 3. What is inside: every PS requirement

| # | PS requirement | Where in the app |
| --- | --- | --- |
| 1 | Secure upload/update by APAAR ID | **Upload**: Excel bulk (template + in-browser pre-check), single form, REST API. Batches signed with the college's Ed25519 key |
| 2 | Intake, enrolment, supernumerary, NRI, OCI, FN | **Seat Ledger**: approved intake → typed seat slots (W within intake, T TFW, F FN/OCI/PIO/CIWGC, P PMSSS, L lateral); NRI sub-cap; proof document per category |
| 3 | Duplicates, invalid APAAR, excess intake, inconsistencies, cross-institution duplicates | 15 validation codes in 3 layers (V01–V15). Layer 1 in browser; Layer 2 ABC + ledger + cross-college index; Layer 3 Radar |
| 4 | Real-time dashboards | AICTE national (India tile map, drill-down), Regional, Institution, Verifier dashboards |
| 5 | Secure verification for stakeholders | **Verify** page (QR camera / photo / link, offline), consent-based **Access requests**, REST `/verify` |
| 6 | Verifiable records linked to identity | W3C-style Verifiable Credentials signed by AICTE (Ed25519), salted-digest selective disclosure, DigiLocker push |
| 7 | Integration / API | **API sandbox** with 13 endpoints, role-enforced, OpenAPI 3 download, mock ABC registry with the same contract |
| 8 | Security, privacy, RBAC, audit, consent | 6 roles + permission matrix, Firestore rules, field-level encryption, salted-hash matching, hash-chained audit + Merkle roots, consent ledger |
| 9 | Reports | Compliance, state, category, flag register, **NBA SAR**, **NAAC 2.1.1**, **NIRF** → Excel / CSV / print-PDF; plain-language questions |
| 10 | APAAR ID + student ID on certificates | **Certificates**: degree / bonafide certificate with APAAR ID, student ID and a signed QR |

## 4. Beyond the PS (USPs)

1. **Seat Ledger**: excess admission is *prevented* at upload (V03), and every blocked attempt is recorded and replayable day by day.
2. **Ghost Student Radar**: cross-college graph: same APAAR in two colleges (V04), look-alike identities with different APAAR IDs using Indic transliteration folding + Jaro-Winkler (V11), one phone / bank account on many students (V06), YoY jumps (V07), declared-vs-verified gaps (V13), Isolation Forest outliers (V14). Every flag explains itself.
3. **Scholarship cross-check (V12)**: claims (mock NSP feed) matched to occupied seats; withhold / release payments.
4. **Institution Data Trust Score** (0–100, five parts, capped by institution-level anomalies) → **risk-based Inspection planner**.
5. **Offline QR verification + selective disclosure**: the student chooses which fields each QR reveals; tampering with any field is detected.
6. **Student consent ledger + "Who viewed my data"** (DPDP Act 2023 principles).
7. **Tamper-evident audit**: hash chain + daily Merkle roots, with a "Simulate tampering" demo.
8. **Lifecycle & dropout early warning**, withdrawal / transfer / graduation vacate seats automatically.
9. **Bharat-first UX**: English / हिन्दी / मराठी, "How to use this page" guide on every screen, WhatsApp-style notification inbox, Excel fix lists.
10. **Setu Sahayak chatbot**: answers how-to questions about every page and data questions ("How many OCI students in Karnataka?", "Lowest trust scores", "Seats left in BTCS") within the user's role scope. Runs fully in the browser; no paid AI API.
11. **Public Transparency page** with small-cell suppression.

## 5. A 5-minute demo script

1. **Ledger hook**: sign in as `principal@sahyadri.demo` → Seat Ledger → B.Tech CS is 60/60 → "Try to admit one more" → **Blocked (V03)**.
2. **Bulk upload**: sign in as `clerk@sahyadri.demo` → Upload → "Sample file with test data" → drop it back → red rows before sending → Upload → reason codes; Inbox shows the WhatsApp summary.
3. **Sign & submit** as the principal → **verify signature & approve** as `admin@aicte.demo`.
4. **Radar**: admin → Ghost Student Radar → V06 network: one phone number on 9 students across colleges.
5. **Dashboard**: India map → Gujarat → Narmada EC, Trust 39 → Inspection planner.
6. **Verification**: `student@apaar.demo` → My credentials → tick fields → open the link in a private window (or scan the QR) → **Genuine**. Change one character → **Not genuine**.
7. **Consent**: student allows Navyug Infotech → `hr@navyug.demo` opens the record → student's "Who viewed my data" shows it.
8. **Audit**: admin → Audit trail → Verify chain → Simulate tampering → chain breaks at the edited entry.

## 6. Architecture

```
React (Vite) single-page app
 ├─ pages/            one file per screen, role-guarded routes (App.jsx)
 ├─ components/       UI kit, Layout + role-based nav, Chatbot, India tile map, Radar graph (d3-force), QR
 ├─ services/         business logic shared by UI and REST sandbox
 │   ├─ enrolment.js  upload pipeline (Layer 1 → ABC → Seat Ledger → cross-college), sign/submit/verify
 │   ├─ ledger.js     seat capacity, slots, replay
 │   ├─ radar.js      Ghost Student Radar (V04, V06, V07, V11, V13, V14) + graph
 │   ├─ scholarship.js, trust.js, lifecycle.js, credentials.js, consent.js, audit.js, reports.js, api.js
 │   └─ assistant.js  Setu Sahayak chatbot engine
 ├─ data/
 │   ├─ store.js      in-memory store, pluggable backend
 │   ├─ backends/local.js     Demo mode (localStorage)
 │   ├─ backends/firebase.js  Firebase Auth + Firestore, role-scoped queries, audit transactions
 │   ├─ scope.js      what each role may see (mirrored in firestore.rules)
 │   ├─ mockAbc.js    deterministic mock of the ABC/APAAR registry (Verhoeff checksum IDs)
 │   └─ seed.js       synthetic dataset with planted anomalies
 └─ lib/              crypto (tweetnacl: Ed25519, SHA-512, XSalsa20-Poly1305), i18n, guides, Isolation Forest
```

Main libraries: React 18, React Router 6, Recharts, Firebase JS SDK 11, SheetJS (xlsx), qrcode, jsQR, tweetnacl, d3-force. All free and open source.

## 7. Honest notes for judges

- **ABC/APAAR registry is mocked** with the same request/response shape as the ABC institutional API (`src/data/mockAbc.js`). Production swaps the endpoint, not the design.
- **Signing keys**: for a free, serverless demo the AICTE issuer key and college keys are derived in the browser. In production, signing runs in a server function with keys in an HSM / Cloud KMS; only public keys ship to clients. Verification already works exactly as it would in production (public key only, offline).
- **WhatsApp / SMS** messages are stored in an inbox instead of being sent (the WhatsApp Business API is paid).
- **DigiLocker push** is simulated (production: DigiLocker Issuer API).
- Firestore Spark-plan quotas limit how often a large admin dashboard can be reloaded per day; use the Lite dataset for live Firebase demos.
- Category caps are configurable starting points (Rules & settings); confirm them against the current AICTE Approval Process Handbook.

## 8. Folder checklist

```
apaar-setu/
├─ index.html, vite.config.js, package.json
├─ .env.example          copy to .env for Firebase
├─ firebase.json         hosting + rules config
├─ firestore.rules       role-based security rules
├─ firestore.indexes.json
├─ public/favicon.svg
└─ src/ …                (see Architecture)
```
