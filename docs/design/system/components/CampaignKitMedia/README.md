# CampaignKitMedia

CampaignKit — the media library for posts (S146, plan §5.2): a "Media" tab in Calendar postări. Keys `marketing.med.*` in `i18n/marketing.json`, 6 languages.

**The library.** Upload (FileUpload, PNG or JPG up to 8 MB each, as for posts), search by name, filters Toate / Folosite / Nefolosite, the storage used (UsageMeter), a grid with the name and "Folosită în {n}".

**One image** (Drawer): name, alternative text (filled into every new post), where it is used (posts, e-mail campaigns); "Șterge imaginea" is disabled while it is in a scheduled post (published ones keep their copy).

**States.** Upload errors (wrong type, too big) next to one still uploading; a search with no result; the empty library. **The picker** in Postare nouă: "Alege din bibliotecă", several images, "Adaugă {n} imagini".

Shown at 1280, 820 and 390, light and dark, with a DE / IT test.

**DE DECIS (S146).** **Storage.** Recommendation: 500 MB per business, shared with the e-mail editor's images; deleting an image used in a sent e-mail keeps the copy in that e-mail.
