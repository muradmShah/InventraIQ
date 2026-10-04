# InventraIQ starter

This is the InventraIQ local project. It opens on a responsive one-page public landing page with separate Manager and Staff demo sign-in options. Choosing an account opens sign-in in a dialog over the same page. After sign-in, the app provides a dashboard, SQLite-backed catalog, stock movements, Manager-only product setup, pricing and reports, and an AI assistant powered by local Ollama/Qwen. The demo catalog has 52 sample products across Electronics, Clothing, Grocery, and Household. The assistant answers common quantity and low-stock questions directly from SQLite; Qwen interprets other supported questions. A request to change stock creates a review card, and the server changes stock only after that signed-in user presses **Confirm stock change**. Managers can add a product or edit its name, SKU, category, unit, and low-stock threshold. A new product starts at zero stock; quantities can only change through a recorded stock movement. Staff cannot access pricing, reports, or product setup. All seeded product rows and quantities are demonstration data and must be replaced with the client's actual inventory before live use.

## Run it on Windows

1. Install Node.js LTS if it is not already installed: https://nodejs.org/
2. Extract the ZIP, then open the inner `InventraIQ` folder in your coding tool or PowerShell.
3. Open its terminal and run:

   ```bash
   npm.cmd install
   npm.cmd run dev
   ```

4. Keep the terminal open and wait for both the API and Vite messages. Open `http://localhost:5173/` in your browser.
5. To stop the website, return to the terminal and press `Ctrl+C`.

## Demo sign-in accounts

- Manager: `manager@stocksense.local` / `Manager123!`
- Staff: `staff@stocksense.local` / `Staff123!`

Select a role card on the sign-in page to fill its demo account, then press **Sign in**. These credentials and prices are for a local preview only.

## Final quality check

After installing dependencies, run `npm.cmd test` in PowerShell. This starts a temporary API, database, and mock Ollama endpoint; it checks sign-in, role permissions, database-grounded AI answers, the human-confirmation step for stock changes, and supplier and movement rules. It removes its temporary data afterward and does not change your regular `data` folder. The mock verifies the connection format; it does not require the real Ollama app or Qwen model.

To check that the website can be packaged for production, run `npm.cmd run build`.

## Check the website manually

1. On the home page, select **Continue as Manager** or **Continue as Staff**. The demo username and password are shown on the selected role card and filled into the sign-in form. Sign in and check the role at the bottom of the sidebar.
2. Open **Products**. Search for `cable` or SKU `EL-2048`, and try the category and stock status filters.
3. Open **Stock movements**, select a product, enter a quantity and supplier or reason, then record stock in or out. For stock out, choose a reason. Only movements marked **Sale** count in sales answers.
4. Try to remove more units than are available. The server should reject it and leave the quantity unchanged.
5. Confirm the history row contains the item, previous and new quantities, your demo user name, and the reference note.
6. Sign out and sign in as Manager. Open **Pricing**, check the sample cost/sale prices, edit a price, and save it.
7. Sign out and sign in as Staff. The **Pricing** link should be hidden. The server also rejects staff requests to manager pricing routes with `403 Forbidden`.
8. Resize the browser to a phone width. Use the menu button to open navigation, then switch between pages available to that role.
9. Open **AI assistant** after starting Ollama and downloading the configured Qwen model. Ask a stock question and verify the answer matches the product records.
10. Ask it to add or remove a small quantity of a sample product. Check the review card, select **Cancel proposal**, and confirm that the product quantity did not change.
11. Ask again for a stock change. Check the product, direction, reason, quantity, and before/after values. Press **Confirm stock change** only when they are correct. Verify the new quantity and find the recorded action on **Stock movements**.
12. If stock has changed since a proposal was prepared, confirmation should be rejected and you should prepare a fresh proposal. A cancelled, expired, or already-confirmed proposal cannot be reused.
13. Sign in as Manager and open **Reports**. Choose a date range and apply it. Check stock-in, stock-out, recorded-sales totals, sales ranking, reasons, and who made each change.
14. Export the filtered activity as a CSV file. If there are more than 200 events, the table and export contain the latest 200; summary totals still cover the entire selected date range.
15. Sign in as Staff. The **Reports** link should be hidden, and requesting `/api/manager/reports` directly should return `403 Forbidden`.
16. Sign in as Manager and open **Product setup**. Add a sample product with a unique SKU and positive cost and selling prices. Confirm it appears with zero stock and in the change log.
17. Edit its name, category, unit, or low-stock threshold. Confirm the audit list shows what changed. Staff should not see **Product setup**, and direct staff API requests should return `403 Forbidden`.
18. Try to add another item using a duplicate SKU or invalid threshold. InventraIQ should reject it. Add received quantity using **Stock movements**; the catalog form does not edit stock.
19. As Manager, open **Suppliers**, add a supplier, edit its contact details, then deactivate it. Confirm the supplier audit log records those actions.
20. Record stock in and select an active supplier. Confirm the movement history and Manager report show that supplier. Inactive suppliers should not be offered for future receipts, while older receipts keep their supplier name. Staff can select active suppliers but cannot open supplier management or call its Manager-only API.
21. In another PowerShell window in the project folder, run `Invoke-RestMethod http://localhost:3001/api/health`. It should report `ok: True` and `database: SQLite`.

## Set up Ollama and Qwen (local AI)

The default assistant uses Ollama on the same computer as InventraIQ. Questions are sent to the local Ollama service; the model does not write to the inventory database. InventraIQ reads real records itself, and a person must confirm every stock change.

1. Install Ollama for Windows from [ollama.com/download](https://ollama.com/download), then open the Ollama app.
2. In PowerShell, download the lightweight default Qwen model:

   ```powershell
   ollama pull qwen3:0.6b
   ```

3. In the project folder, create the local settings file:

   ```powershell
   Copy-Item .env.example .env
   ```

   The example already selects Ollama at `http://127.0.0.1:11434` with model `qwen3:0.6b`. Keep this model name aligned with the model shown by `ollama list`.
4. Start InventraIQ with `npm.cmd run dev`, then open **AI assistant**.
5. Try “How many Type-C Fast Charging Cables are in stock?” and “Which products are low in stock?” These stock answers use current SQLite rows. “What sold most this week?” only includes movements marked **Sale**.
6. Ask “Add 5 units of Type-C Fast Charging Cable as a delivery” to see a proposal. Cancel it to leave stock unchanged, or confirm it to save the movement.
7. Sign in as Staff and ask about a product's cost or profit. The assistant should explain that pricing is Manager-only. Sign in as Manager to test a pricing question.

If Ollama cannot be reached, open the Ollama app and confirm it is running. If the model is missing, run `ollama pull qwen3:0.6b`. Ollama must be installed on the same computer where the InventraIQ server runs. To use OpenAI instead, set `AI_PROVIDER=openai` and provide `OPENAI_API_KEY` in `.env`.

If no sales have been recorded with the **Sale** reason, the assistant says so. It does not treat damage, transfers, or other removals as sales. Chat messages are not stored as a conversation history. A stock change proposal is temporary and held in server memory for up to 10 minutes; normal stock changes can still be made from the human-operated Stock movements form.

The 52 sample product rows, demo users, and illustrative cost/sale prices are stored in `data/stocksense.sqlite`. When the existing demo database is recognized, missing demo SKUs are added without replacing its current quantities. Other custom product catalogs do not receive the demo rows. Stock and price changes persist in this local database. The dashboard stock-value figure is illustrative. Before the mall uses the system for live operations, replace the demo catalog with the client's real product list and quantities, configure real staff accounts, choose hosting with HTTPS and persistent database storage, set up backups, and test the workflow with the client. The demo accounts and sample records are not suitable for live operations.

## PowerShell note

If PowerShell blocks `npm.ps1`, use the `npm.cmd` commands shown above. This avoids changing PowerShell's script policy.
