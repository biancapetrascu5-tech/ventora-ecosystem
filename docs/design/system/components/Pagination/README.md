# Pagination

Move through pages of a list: range ("21–40 din 248"), rows per page, page numbers with gaps, previous/next.

**Props.** `page`, `pageSize`, `total`, `onPageChange(page)`, `onPageSizeChange(size)` (omit to hide the selector), `pageSizes`, `compact` ("Pagina 2 din 13" with arrows — for narrow spaces). Numbers are formatted for the active locale (1.284 in RO/DE, 1,284 in EN). Paging is server-side (skip/take); never slice a full list in the browser.
