# Tallyard HireDesk — test accounts

| Username | Password | Name | Role |
|---|---|---|---|
| maria | Depot!Manager1 | Maria Okafor | Manager |
| tom | Counter!Clerk1 | Tom Riley | Clerk |
| priya | Counter!Clerk2 | Priya Nair | Clerk |

Start: `npx tsx fixtures/acceptance-app/app.ts [port]` from the repository root, or `npm run fixture:hiredesk` (default http://127.0.0.1:8791/). Reset: stop the app (Ctrl+C) and start it again — all data is held in memory and re-seeded on every start.
