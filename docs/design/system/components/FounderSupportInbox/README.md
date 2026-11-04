# FounderSupportInbox

Founder · "Suport" (lotul 4.6, D4-14 b): the requests businesses send from the Hub, the thread and the team's reply. A new Spine entry "Suport", after "Cereri", with the number of open requests. Romanian only (S57); keys `founder.inbox.*` in `i18n/founder-support.json`.

**The list.** SegmentedControl "Deschise · {n}" / "În lucru · {n}" / "Închise", the app (Select), the business (Combobox), search by subject or reference. DataTable: subject with reference and "Mă blochează", business, app, last message (who, when), status — "Deschisă" (peach: it waits for you), "În lucru" (neutral), "Închisă" (lime). Empty: "Nicio solicitare deschisă"; no match: "Nicio solicitare pentru filtrele alese" + "Șterge filtrele".

**The thread.** The business's messages on `sheet`, the team's on `raised`, with attachments. "Răspunsul echipei" (Textarea), attachments (FileUpload: PNG, JPEG, PDF, at most 10 MB each; errors for empty reply, wrong type, too big), "Trimite răspunsul" and "Trimite și închide". On the side: the business (owner, plan, who sent it, "Deschide afacerea", "Deschide o sesiune de suport") and the status actions.

**In the Hub.** Deschisă → "În lucru"; a team reply → "Răspuns nou" (HubSupportThread, with "Îți răspundem aici și pe e-mail." under the reply box, and e-mail E-7); Închisă → "Rezolvat". A business can reopen a closed request; it comes back under "Deschise".

**Decided (S116, 4 Nov. 2026).** S116-D18 · A request closes automatically after 7 days without an answer from the business, with an e-mail the day before.

Shown at 1280 and 390, in light and dark.
