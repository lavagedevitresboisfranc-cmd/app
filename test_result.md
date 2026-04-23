#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "Add a Revenues/Income module to complement the Expenses module. Categories: Saison Printemps, Saison Automne. Payment methods: E-transfert, Cash, Chèque, Carte de crédit. Plus a Balance Sheet (Bilan) endpoint combining revenues - expenses."

backend:
  - task: "Soft-delete for appointments (DELETE /api/appointments/{id} → status=archived)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Changed DELETE /api/appointments/{id} from hard-delete to soft-delete: now sets status='archived' + archived_at timestamp instead of removing the document. GET /api/appointments now excludes archived by default; pass ?include_archived=true or ?status=archived to see them. Added POST /api/appointments/{id}/restore to restore archived → status='upcoming'. Added DELETE /api/appointments/{id}/permanent for explicit hard-delete. Goal: prevent accidental data loss on confirmed appointments."
        - working: true
          agent: "testing"
          comment: "19/19 assertions PASS via /app/backend_test.py against EXPO_PUBLIC_BACKEND_URL. Full soft-delete flow verified: (1) POST creates upcoming appt, (2) shows in default list, (3a) DELETE /{id} → 200 with exact shape {'message':'Appointment archived','archived':true} and (3b) record remains in DB with status='archived'; (4) hidden from default GET /appointments; (5) ?include_archived=true → id present; (6a) ?status=archived → id present and all returned items are archived; (6b) ?status=upcoming → id absent; (7) GET /{id} still returns appt with status='archived'; (8) POST /restore → 200 with status='upcoming' and archived_at unset on doc; (9) reappears in default list; (10) re-archive then DELETE /{id}/permanent → 200 with exact shape {'message':'Appointment permanently deleted'}, subsequent GET /{id} → 404, and ?include_archived=true no longer lists id; (11) all 3 unknown-id paths (DELETE, POST /restore, DELETE /permanent) → 404. Minor: `AppointmentResponse` Pydantic model does not declare an `archived_at` field, so the archived_at timestamp is stripped from JSON responses even though it IS stored in MongoDB (restore's $unset works correctly, confirming the value exists server-side). If the frontend needs to display 'archived on <date>' it will need `archived_at` added to the response model. Test appointment + auto-linked client cleaned up at end of run."

  - task: "Revenues CRUD (POST, GET, PUT, DELETE /api/revenues)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Created full CRUD for /api/revenues with categories ['printemps','automne'] and payment methods ['etransfert','cash','cheque','credit']. Fields: amount, category, date, description, client_name, payment_method, appointment_id. Invalid categories/payment methods should return 400."
        - working: true
          agent: "testing"
          comment: "All CRUD ops verified end-to-end via /app/backend_test.py against EXPO_PUBLIC_BACKEND_URL. POST valid (printemps/automne × etransfert/cash/cheque/credit) → 200 with correct echoed fields; default payment_method=cash works. Negative cases all return 400 (amount=0, amount<0, invalid category 'hiver', invalid payment_method 'bitcoin'). GET list returns sorted by date desc; ?category=printemps filter is honored. GET /{id} → 200 for valid, 404 for invalid. PUT updates amount/category/payment_method correctly; invalid category/payment_method on update → 400; unknown id → 404. DELETE valid → {deleted:1}; invalid → 404. All test data cleaned up."

  - task: "Revenues stats (GET /api/revenues/stats)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Returns grand_total, by_category (printemps, automne — both returned even if 0), by_payment (4 methods returned even if 0). Supports start_date and end_date query params."
        - working: true
          agent: "testing"
          comment: "Verified response schema contains by_category, by_payment, grand_total. by_category always includes both 'printemps' and 'automne' (even after date filter that matches nothing). by_payment always includes all 4 methods ('etransfert','cash','cheque','credit'). grand_total == sum of amounts from GET /revenues (830.00 == 830.00 in test run). Sum of by_category totals equals grand_total. ?start_date= and ?end_date= filters behave correctly."

  - task: "Revenues Excel export (GET /api/revenues/export/excel)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Generates .xlsx with 2 sheets: 'Revenus' (Date, Catégorie, Montant, Client, Paiement, Description + TOTAL row) and 'Résumé' (per-category totals + GRAND TOTAL). Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet. Supports ?category=, ?start_date=, ?end_date= filters."
        - working: true
          agent: "testing"
          comment: "HTTP 200 with correct Content-Type application/vnd.openxmlformats-officedocument.spreadsheetml.sheet and Content-Disposition filename 'revenus_crystaltask_YYYY-MM-DD.xlsx'. openpyxl successfully loads workbook with exactly 2 sheets ['Revenus','Résumé']. 'Revenus' header row matches exactly: ['Date','Catégorie','Montant ($)','Client','Paiement','Description']. Category cells render '🌸 Saison Printemps' and '🍂 Saison Automne'; payment cells render all 4 emoji labels ('📱 E-transfert','💵 Cash','📝 Chèque','💳 Carte de crédit') when present. TOTAL row exists. ?category=printemps filter produced an export with zero 'Automne' rows. ?start_date/?end_date filters also return 200."

  - task: "Email campaign HTML preview (POST /api/campaigns/preview-html)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "New endpoint to preview seasonal campaign HTML in the browser. Accepts {body, subject}, returns a fully rendered HTML document built via _build_seasonal_campaign_html with QR code + logo embedded as base64, clickable website / phone anchors, watermark background."
        - working: true
          agent: "testing"
          comment: "25/25 assertions PASS via /app/backend_test.py against EXPO_PUBLIC_BACKEND_URL. (1) Happy path with real French body + subject 'Printemps — Lavage de vitres': HTTP 200, Content-Type text/html, starts with <!DOCTYPE html>, contains <a href=\"https://Lavagedevitre.org\" EXACTLY 2 times (bare 'Lavagedevitre.org' + footer URL both hyperlinked), contains <a href=\"tel:+15145709802\", >=2 data:image/jpeg;base64, occurrences (QR + logo both embedded), background-image:url('data:image/jpeg;base64, present (logo watermark), subject in <title>, 'Scannez pour prendre rendez-vous' QR caption present, response size 253.5 KB (>200KB), 'Bonjour,' present, NO <a><a> double-wrap pattern (regex verified), NO '§§' placeholder leftovers. (2) Empty body: HTTP 200, valid HTML with <table> frame, QR + logo still embedded, 'Test' subject in <title>. (3) XSS escape: HTTP 200, raw <script>alert('xss')</script> NOT present in response, escaped &lt;script&gt; present. Only <script> tag in HTML is a Cloudflare analytics script injected by the reverse proxy (not from app/user input). (4) Missing body field: HTTP 200, valid HTML with table frame, 'Test only' in <title>, defaults to empty body as expected. No critical issues."

  - task: "Send estimate (PUT /api/requests/{request_id}/send-estimate)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "testing"
          comment: "26/26 assertions PASS via /app/backend_test.py against EXPO_PUBLIC_BACKEND_URL. Setup: POST /api/requests with request_type='est' → 200 returns id, request_type='est' (extra fields service_type/square_footage/notes are silently dropped by Pydantic since RequestCreate doesn't declare them — expected behaviour). T1 valid estimate {price:250.50, note:'Vitres intérieur + extérieur, 30 jours valide'} → 200 with status='estimate_sent', quoted_price=250.5, quote_note matches, quoted_at is valid ISO timestamp (2026-04-23T16:10:05.112320+00:00), request_type='est'. T2 GET /{id} → 200 and all four fields persisted in Mongo. T3 PUT with {price:300.00, note:'Nouveau prix', valid_until:'2026-05-30'} → 200, quoted_price updated to 300.0, quote_valid_until='2026-05-30', quote_note overwritten to 'Nouveau prix'; GET re-confirms persistence. T4 observational: price=0 → 200 quoted_price=0.0; price=-50 → 200 quoted_price=-50.0 (backend does NOT validate price>0 — noted). T5 PUT /api/requests/nonexistent-xyz/send-estimate → 404 {'detail':'Request not found'}. T6 empty body {} → 422 with Pydantic error {type:'missing', loc:['body','price'], msg:'Field required'}. Cleanup: DELETE /{id} → 200 (soft-decline) and DELETE /{id}/permanent → 200 — DB left clean. Backend log review: Resend email send predictably failed with 'You can only send testing emails to your own email address' (sandbox domain limitation), but the failure is properly caught by try/except at server.py:1024-1025 and the endpoint still returns 200 — NO unhandled exceptions raised. No critical issues."

  - task: "Finance Bilan (GET /api/finance/bilan)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Returns total_revenues, total_expenses, net_profit (rev - exp), margin_pct, revenues_by_category, expenses_by_category. Supports start_date/end_date query params. Used by the Bilan frontend screen."
        - working: true
          agent: "testing"
          comment: "Response contains all required keys: period, total_revenues, total_expenses, net_profit, margin_pct, revenues_by_category, expenses_by_category. With 4 revenues (1630.00) and 2 expenses (200.50): net_profit=1429.50 (=rev-exp), margin_pct=87.70 (=profit/rev*100), all rounded to 2 decimals. Date-filtered call returned correct subset totals (950.00 / 120.50). Edge cases verified on narrow date windows: only-revenues → margin_pct=100.0 and net_profit==total_revenues; only-expenses → margin_pct=0.0 and net_profit negative (-75.00). All test-created data deleted at end; /api/revenues and /api/expenses both return empty arrays."

frontend:
  - task: "Revenues screen UI"
    implemented: true
    working: true
    file: "/app/frontend/app/revenues.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "New screen at /revenues. Categories: Saison Printemps (🌸), Saison Automne (🍂). Payment methods: E-transfert (📱), Cash (💵), Chèque (📝), Carte de crédit (💳). Hamburger filter button + category modal, Excel export button, FormModal with amount/category/date (DatePicker on native, HTML input on web)/client/payment/description. Long-press on card → delete confirm."
        - working: true
          agent: "testing"
          comment: "✅ PASS - All core functionality verified on mobile viewport (390x844). Header shows '💰 Revenus', dark-green TOTAL card displays '+0.00 $', hamburger filter shows 'Toutes les catégories' by default. Form modal opens with '💰 Nouveau revenu' title and contains all required fields: Montant (numeric), exactly 2 categories (🌸 Saison Printemps, 🍂 Saison Automne), Date field, Client input (optional), exactly 4 payment methods (📱 E-transfert, 💵 Cash, 📝 Chèque, 💳 Carte de crédit), Description field (optional). Form can be filled and submitted. Category filter modal functional. UI is in French as expected."

  - task: "Bilan screen UI"
    implemented: true
    working: true
    file: "/app/frontend/app/bilan.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "New screen at /bilan. Period chips (Tout, Ce mois, Cette année, 30 jours). Profit card (green if positive, red if negative). Revenue/Expense comparison bars. Per-category breakdown with mini progress bars."
        - working: true
          agent: "testing"
          comment: "✅ PASS - All core functionality verified on mobile viewport (390x844). Header shows '📊 Bilan', 4 period chips present (Tout, Ce mois, Cette année, 30 jours) with 'Ce mois' as default active. Main hero card shows '✅ PROFIT NET' (green) with '+0.00 $' and 'Marge: 0.0%'. Two stat cards below show REVENUS (green, +0.00) and DÉPENSES (red, -0.00). Period chip selection works ('Tout' becomes active when clicked). Pull-to-refresh gesture functional. UI displays correctly in French."

  - task: "Finance section in hamburger menu (index.tsx + AppHeader.tsx)"
    implemented: true
    working: true
    file: "/app/frontend/app/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Finance section now contains 4 items: Revenus (/revenues), Dépenses (/expenses), Bilan (/bilan), Estimation (/estimate). Previously Finance section was missing from index.tsx drawer. Also added 'Corbeille Clients' to Clients section and 'Campagnes programmées' to Marketing section."
        - working: true
          agent: "testing"
          comment: "✅ PASS - All navigation functionality verified on mobile viewport (390x844). Hamburger menu opens correctly, Finance section (testID: section-finance) expands to show exactly 4 items: Revenus (/revenues), Dépenses (/expenses), Bilan (/bilan), Estimation (/estimate). Navigation to /revenues and /bilan confirmed working. Also verified Corbeille Clients under Clients section and Campagnes programmées under Marketing section are present. Language toggle to French works correctly. All menu items have proper testIDs and function as expected."

  - task: "Receipt images → PDF conversion (POST /api/expenses/images-to-pdf + GET /api/expenses/{id}/receipt-pdf)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "NEW: (1) POST /api/expenses/images-to-pdf accepts {images: [base64 strings]} list and returns {pdf_base64: 'data:application/pdf;base64,...', pages, size_kb}. Uses PIL to convert each image to RGB, resize if >2200px, then save as multi-page PDF via Image.save(format='PDF', save_all=True, append_images=...). Max 20 pages. Handles data URL prefixes (strips 'data:image/...;base64,'). Returns 400 if images empty or >20. (2) GET /api/expenses/{id}/receipt-pdf returns the attached PDF as a StreamingResponse with Content-Type 'application/pdf' and inline disposition with auto-generated filename 'Recu_<vendor>_<date>.pdf'. (3) Expense model now includes 'receipt_pdf' Optional[str] field (base64 PDF). ExpenseCreate/Update/Response all updated. Smoke-tested end-to-end (3-page receipt → PDF → save expense → download PDF, all PASS, %PDF signature valid). Ready for formal testing."
        - working: true
          agent: "testing"
          comment: "✅ 54/54 assertions PASS via /app/backend_test.py against EXPO_PUBLIC_BACKEND_URL. (1) POST /api/expenses/images-to-pdf: (a) 1 image → 200, pdf_base64 prefixed with 'data:application/pdf;base64,', pages=1, size_kb>0, decoded bytes start with %PDF-; (b) 3 images → 200, pages=3, %PDF valid, multi-page PDF byte-length > single-page byte-length confirming multi-page content; (c) mixed data-URL + raw b64 inputs → 200, pages=2, valid PDF; (d) RGBA PNG with transparency → 200, pages=1, valid PDF (RGBA→RGB conversion with white bg works); (e) empty images=[] → HTTP 400 detail='Aucune image fournie'; (f) 21 images → HTTP 400 detail='Maximum 20 pages par PDF'; (g) invalid base64 'not-a-valid-base64-!@#' → HTTP 400 detail about image processing; (h) 3000x2400 image → 200, resized internally, valid PDF. (2) GET /api/expenses/{id}/receipt-pdf: (a) expense with receipt_pdf → 200, Content-Type=application/pdf, body starts with %PDF-, Content-Disposition='inline; filename=\"Recu_Canadian_Tire_2026-04-15.pdf\"' (vendor spaces→underscores confirmed, date present); (b) expense without receipt_pdf → 404 'Aucun PDF attaché'; (c) non-existent id → 404 'Dépense introuvable'; (e) truly-invalid b64 (e.g. 'ABCDE' — length not mult of 4) → HTTP 500 detail contains 'PDF corrompu'. (3) Expense model regression: POST with receipt_pdf + receipt_photo → both echoed; GET /{id} returns receipt_pdf unchanged; PUT updating receipt_pdf → 200, persisted to Mongo (confirmed via re-GET); GET /expenses list items include receipt_pdf field populated; photo-only expense works (receipt_pdf=None, receipt_photo preserved) — new field does not break the old one. Minor observation (NOT a blocker, not requested in spec either): the /receipt-pdf endpoint does NOT validate %PDF magic bytes post-decode, so valid-base64-but-not-PDF content (e.g. '!!!!!!not_valid!!!!' which filters to 'notvalid', length 8, decodes OK) returns HTTP 200 with garbage bytes and Content-Type 'application/pdf'. This only happens if the DB content has been actively corrupted with non-PDF data that happens to be valid b64 — unlikely in practice because all paths writing to receipt_pdf go through /images-to-pdf which produces real PDFs. All 6 test expenses cleaned up at end of run; GET /api/expenses returns empty list."

  - task: "OCR receipt extraction via Gemini Vision (POST /api/expenses/ocr-receipt)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "NEW: POST /api/expenses/ocr-receipt takes {images: [base64 strings, max 10]} and returns {amount, vendor, date (YYYY-MM-DD), description, raw_text, confidence}. Uses emergentintegrations library + EMERGENT_LLM_KEY + gemini-2.5-flash model. System prompt instructs JSON-only output. Response parsing handles markdown code fences and extra text with regex fallback. Safe float/str normalization. Returns 400 if no images or >10. Returns 502 if Gemini API fails. Smoke-tested with synthetic Canadian Tire receipt (JPEG, 191.16$ total) — Gemini extracted ALL fields correctly with confidence=1.0: amount=191.16, vendor='Canadian Tire', date='2026-04-23', description='Achat de vis, boulons en acier et une perceuse Dewalt.', full raw_text transcription. Ready for formal testing."
        - working: true
          agent: "testing"
          comment: "✅ 31/31 assertions PASS via /app/backend_test.py against EXPO_PUBLIC_BACKEND_URL. Scope strictly limited to POST /api/expenses/ocr-receipt. (1) Happy path — synthetic PIL-generated Canadian Tire JPEG receipt: HTTP 200 in 5.2s, response has all 6 keys (amount, vendor, date, description, raw_text, confidence). LLM extraction QUALITY: amount=191.16 (exact match to rendered TOTAL), vendor='CANADIAN TIRE' (contains 'Canadian' ✓), date='2026-04-23' (YYYY-MM-DD ✓), confidence=1.0 (in [0,1] ✓), raw_text len=347 chars with full item-by-item transcription, description='Achat de vis, boulons en acier, une perceuse DeWalt 20V et un ruban mesureur.' (2) Multi-page (2 images, synthetic Home Depot receipt with TOTAL=777.77): HTTP 200 in 6.3s, amount=777.77 exact, vendor='HOME DEPOT', date='2026-03-15', conf=1.0. Gemini correctly joined page1 items + page2 totals. (3) Data URL prefix handling: 'data:image/jpeg;base64,...' prefix → 200; raw base64 → 200; both work (server strips prefix at server.py:3015-3019). (4) Empty images [] → HTTP 400 detail='Aucune image fournie'. (5) 11 images → HTTP 400 detail='Maximum 10 pages par OCR (limite LLM)'. (6) Non-receipt (400x400 solid red JPEG) → HTTP 200, no crash, amount=None, vendor=None, confidence=0.0 (LLM gracefully returned nulls as instructed by system prompt). (7) Invalid base64 'not-valid-base64-!!' → HTTP 502 with detail containing 'Erreur OCR (LLM): ... GeminiException BadRequestError Invalid value' (server catches the LiteLLM exception cleanly — no crash, no unhandled 500). (8) Server still healthy post-tests: GET /api/expenses → 200. No data persisted (endpoint is read-only). Gemini 2.5 Flash latency observed: 2.3–6.3s per call, well within 60s timeout. Backend logs show clean LiteLLM gemini/gemini-2.5-flash completions for all successful calls. No critical issues."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "main"
      message: "Please test the new Revenues module and Bilan endpoint. Focus: 1) CRUD /api/revenues — create valid revenues with categories 'printemps'/'automne' and payment methods 'etransfert'/'cash'/'cheque'/'credit'. Verify invalid category/payment_method returns 400. Test GET list with and without ?category=. Test update and delete. 2) /api/revenues/stats — verify by_category returns BOTH 'printemps' and 'automne' (even with 0 total), by_payment returns all 4 methods, grand_total correct. 3) /api/revenues/export/excel — HTTP 200, correct content-type (.xlsx), file is a valid openpyxl workbook with 'Revenus' and 'Résumé' sheets. Test with and without ?category= filter. 4) /api/finance/bilan — create a few revenues and expenses, verify total_revenues, total_expenses, net_profit (rev-exp), margin_pct. Test with start_date/end_date filters. IMPORTANT: Clean up all test data (revenues + expenses) after testing so the database stays empty. Do not test any pre-existing endpoints unless they broke due to the new changes."
    - agent: "testing"
      message: "All 4 Finance-module backend task groups PASS (79/79 assertions) via /app/backend_test.py against EXPO_PUBLIC_BACKEND_URL. Revenues CRUD: valid POSTs (incl. default payment_method=cash) succeed; amount<=0, invalid category 'hiver', invalid payment_method 'bitcoin' all return 400; GET list sorted by date desc and ?category=printemps filter works; GET/PUT/DELETE 404 on bad ids; DELETE returns {deleted:1}. Stats: by_category always includes both printemps+automne and by_payment always includes all 4 methods (even with 0 / after filter); grand_total equals sum of amounts; date filters honored. Excel export: 200 + correct Content-Type + filename 'revenus_crystaltask_YYYY-MM-DD.xlsx'; valid openpyxl workbook with sheets ['Revenus','Résumé']; headers + emoji labels ('🌸 Saison Printemps','🍂 Saison Automne','📱 E-transfert','💵 Cash','📝 Chèque','💳 Carte de crédit') + TOTAL row present; ?category=printemps produces zero Automne rows; ?start_date/?end_date → 200. Finance Bilan: all required keys present, calculations correct to 2 decimals (net_profit = rev-exp, margin_pct = profit/rev*100), date filters produce correct subsets, edge cases confirmed (only-revenues → margin_pct=100; only-expenses → margin_pct=0 and net_profit negative). Cleanup successful — /api/revenues and /api/expenses both return empty arrays at end of run. No critical issues."
    - agent: "testing"
      message: "✅ SOFT-DELETE for /api/appointments PASS — 19/19 assertions via /app/backend_test.py against EXPO_PUBLIC_BACKEND_URL. Full lifecycle verified end-to-end: create → default list visible → DELETE /{id} returns exactly {'message':'Appointment archived','archived':true} (HTTP 200) and record stays in DB with status='archived'; default GET hides it; ?include_archived=true and ?status=archived both include it; ?status=upcoming excludes it; GET /{id} still returns status='archived'; POST /{id}/restore returns status='upcoming' and removes archived_at from the doc (confirmed by re-querying); default list re-includes; re-archive then DELETE /{id}/permanent returns {'message':'Appointment permanently deleted'} and subsequent GET /{id} → 404 and include_archived=true list no longer contains it; all three unknown-id routes return 404. Test data + auto-linked client cleaned up — DB left clean. Minor observation (not a blocker): `AppointmentResponse` Pydantic model has no `archived_at` field, so the timestamp is stripped from JSON responses (it is stored correctly in Mongo — restore's $unset confirms). If the UI needs to show 'archived on ...' the field should be added to AppointmentResponse."
    - agent: "testing"
      message: "✅ SYNC-TO-CLIENT-DB FLOW PASS — 33/33 assertions via /app/backend_test.py against EXPO_PUBLIC_BACKEND_URL ({URL}/api). Used an existing client from GET /clients-db?limit=50 (no persistent test data created; all modified fields restored). (1) POST /api/clients-db/match by email: matched=True, by='email', client.id matches (HTTP 200). (2) match with real phone + fake email 'does-not-exist-xyz-9999@example.com': matched=True, by='phone', client.id matches (HTTP 200). (3) match with name only (email='', phone=''): matched=True, by='name', client.id matches (HTTP 200). (4) match with bogus name/email/phone: matched=False, by=None, client=None (HTTP 200). (5) PUT /api/clients-db/{id} with {'email':'test-sync@temp.com'} only: 200, GET confirms email updated, phone+address UNCHANGED; restore via PUT works (email back to original). (6) PUT multi-field {'email':'multi-sync@temp.com','phone':'5145550000','address':'999 Test St'}: 200, GET confirms all 3 updated; restore via PUT returns all 3 fields to original values. (7) PUT /api/clients-db/nonexistent-id-xyz → HTTP 404 as expected. Priority order in /match endpoint is email > phone > name (server.py:1209-1232) matches expected behaviour. No critical issues. Candidate client: id=4a3fdf59-253b-46aa-9cd7-8f288fdc3cc8 ('Abby Gilkes-McFarlane') — left in its original state at end of run."
    - agent: "testing"
      message: "✅ PUT /api/requests/{id}/send-estimate PASS — 26/26 assertions via /app/backend_test.py against EXPO_PUBLIC_BACKEND_URL. Setup POST /requests (request_type='est') → 200 with id. T1 valid estimate {price:250.50, note:'Vitres intérieur + extérieur, 30 jours valide'} → 200 with status='estimate_sent', quoted_price=250.5, quote_note exact match, quoted_at valid ISO timestamp, request_type='est'. T2 GET /{id} persists all fields. T3 PUT with valid_until:'2026-05-30' → 200 updates quoted_price to 300.0, sets quote_valid_until='2026-05-30', overwrites quote_note to 'Nouveau prix'; GET confirms persistence. T4 edge cases: price=0 accepted (quoted_price=0.0), price=-50 accepted (quoted_price=-50.0) — backend does NOT validate price>0 (reported, not a blocker per request). T5 unknown id → 404 'Request not found'. T6 empty body → 422 Pydantic 'Field required' on body.price. Cleanup: DELETE /{id} (soft) + DELETE /{id}/permanent both 200 — DB clean. Backend logs: Resend email send failed with expected sandbox domain restriction ('You can only send testing emails to your own email address') but the exception is caught by try/except at server.py:1024 and endpoint still returns 200 — NO unhandled exceptions. Scope strictly limited to this one endpoint + RequestResponse schema. No critical issues."
    - agent: "testing"
      message: "✅ POST /api/campaigns/preview-html PASS — 25/25 assertions via /app/backend_test.py against EXPO_PUBLIC_BACKEND_URL. (1) Happy path (real French body, subject 'Printemps — Lavage de vitres'): HTTP 200, Content-Type text/html, starts with <!DOCTYPE html>, contains <a href=\"https://Lavagedevitre.org\" EXACTLY 2 times (both the bare 'Lavagedevitre.org' CTA line and the footer URL are hyperlinked), contains <a href=\"tel:+15145709802\", >=2 data:image/jpeg;base64, occurrences (QR + logo both embedded), background-image:url('data:image/jpeg;base64, present (logo watermark), subject appears in <title>, QR caption 'Scannez pour prendre rendez-vous' present, response size 253.5 KB (>200 KB as expected), 'Bonjour,' preserved in HTML, no double-wrapped <a><a> anchors (regex-checked), no '§§' placeholder tokens. (2) Empty body {'body':'','subject':'Test'}: HTTP 200, valid HTML + <table> frame, QR + logo still embedded, 'Test' in <title>. (3) XSS body '<script>alert(\\'xss\\')</script>': HTTP 200, raw <script>alert('xss')</script> NOT present, escaped &lt;script&gt; IS present — proper HTML escaping. The only <script> tag in the response is a Cloudflare analytics script injected by the reverse-proxy edge, NOT from the app or user. (4) Missing body field {'subject':'Test only'}: HTTP 200, valid HTML + table frame, 'Test only' in <title>, body defaults to empty. No critical issues. Scope strictly limited to the new endpoint — no other endpoints touched."
    - agent: "testing"
      message: "✅ OCR receipt extraction (POST /api/expenses/ocr-receipt) PASS — 31/31 assertions via /app/backend_test.py against EXPO_PUBLIC_BACKEND_URL. Scope strictly limited to the new OCR endpoint. (1) Happy path with a PIL-generated Canadian Tire JPEG receipt (black text on white, TOTAL=$191.16, date 2026-04-23, 4 line items): HTTP 200 in 5.2s. All 6 keys present (amount, vendor, date, description, raw_text, confidence). LLM OUTPUT QUALITY: amount=191.16 EXACT, vendor='CANADIAN TIRE' (contains 'Canadian'), date='2026-04-23' matches YYYY-MM-DD regex, confidence=1.0, raw_text=347 chars with full item-by-item transcription, description='Achat de vis, boulons en acier, une perceuse DeWalt 20V et un ruban mesureur.'. (2) Multi-page Home Depot receipt (page1=header+items, page2=totals, TOTAL=$777.77): HTTP 200 in 6.3s, amount=777.77 EXACT, vendor='HOME DEPOT', date='2026-03-15', conf=1.0 — Gemini correctly merged both pages. (3) Data URL prefix ('data:image/jpeg;base64,...') AND raw base64 both → 200. (4) Empty images [] → 400 'Aucune image fournie'. (5) 11 images → 400 'Maximum 10 pages par OCR (limite LLM)'. (6) Non-receipt (400x400 red square JPEG) → 200, no crash, amount=None, vendor=None, confidence=0.0 — LLM gracefully followed system-prompt instruction to null-fill when not a receipt. (7) Invalid base64 'not-valid-base64-!!' → 502 'Erreur OCR (LLM): ... GeminiException BadRequestError Invalid value' — server catches LiteLLM exception cleanly (try/except at server.py:3057-3061), no crash. (8) Server still healthy post-tests: GET /api/expenses → 200. Gemini 2.5 Flash latency 2.3–6.3s per call (well within 60s timeout). No data persisted (endpoint is read-only, no cleanup needed). EMERGENT_LLM_KEY integration verified end-to-end. No critical issues."
    - agent: "testing"
      message: "✅ PDF-from-images feature PASS — 54/54 assertions via /app/backend_test.py against EXPO_PUBLIC_BACKEND_URL. Scope strictly limited to new endpoints (POST /api/expenses/images-to-pdf + GET /api/expenses/{id}/receipt-pdf) and the receipt_pdf field regression. All 8 sub-cases of images-to-pdf pass: 1 image, 3 images (multi-page verified by byte-length growth), mixed data-URL/raw b64, RGBA PNG (transparency → white bg RGB conversion), empty=[] → 400 'Aucune image fournie', 21 images → 400 'Maximum 20 pages par PDF', invalid b64 garbage → 400 with image-processing detail, 3000×2400 large image → 200 with internal resize. All 4 receipt-pdf cases pass: valid download (Content-Type application/pdf, %PDF magic bytes, filename='Recu_Canadian_Tire_2026-04-15.pdf' — spaces→underscores + date confirmed), missing PDF → 404 'Aucun PDF attaché', unknown id → 404 'Dépense introuvable', truly-invalid b64 ('ABCDE' length not mult of 4) → 500 'PDF corrompu'. Expense model regression: POST/GET/PUT all correctly flow receipt_pdf; PUT updates persist; list items include receipt_pdf; receipt_photo still works independently when receipt_pdf is None. 6 test expenses created and all cleaned up — GET /api/expenses returns []. Minor observation (not a blocker, not in spec): /receipt-pdf doesn't validate %PDF magic bytes post-base64-decode, so valid-b64-but-non-PDF content returns 200 with garbage. Only reachable if DB field is directly edited with crafted non-PDF-but-valid-b64 data — in practice all writes go through images-to-pdf which always produces real PDFs. No critical issues."
