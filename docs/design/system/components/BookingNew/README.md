# BookingNew

EasyBook — creating an appointment: client (search or new), service and person, date and the SlotPicker of free times, notes and confirmation/reminder options, with a summary and price. Desktop: form plus sticky summary; tablet: summary under the form; phone: one column with the actions fixed above the bottom bar.

Shown at 1280 (desktop), 820 (tablet portrait) and 390 (phone), in light and dark, built only from the system's components.

After the product review: the default order is service → time → client, and a booking can also start from the client (from their profile or by choosing them first); "Oricine e liber" shows more times; the client field lists "Clienți recenți" first.

**S126 (B.9, B.10).** Repetition, several services in a row, "Din pachet" and the location, drawn in BookingRecurring, BookingMultiService, BookingPackages and BookingLocations.

**S127 (B.23).** "Reducere": a promo code or a manual discount (BookingPromoCodes).

**S129 (B.2b).** "Cu cine" lists only the members who do the chosen service; a service nobody does can't be booked (drawn in BookingServices).

**S137.** "Cu cine" shows each member's own duration and price; "Oricine e liber" shows the range until a time is chosen (drawn in BookingServices).

**S138.** A member's duration and price can be variable, "de la" or an interval, like the service; "Cu cine" and the summary show the member's range, and "Oricine e liber" the span of all of them (drawn in BookingServices).
