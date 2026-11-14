# Tallyard HireDesk — Functional Specification

| | |
|---|---|
| Document | FSD-HD-001 |
| Applies to | Tallyard HireDesk 1.4.x |
| Status | Approved for build |
| Owner | Depot Operations |

## 1. Purpose and business objectives

Tallyard is a tool and plant hire depot. HireDesk is the counter application used by depot staff to take equipment hire bookings, hand equipment out, receive it back, and keep an accurate picture of what is available to hire.

Business objectives:

1. **No double-booking.** Counter staff must be able to trust the availability figure for every equipment line at any moment.
2. **Consistent pricing.** Hire charges, discounts and deposits are calculated by the system, never by hand, and a price quoted to a customer does not change afterwards.
3. **Credit control.** The depot manager can stop new business with customers whose accounts are in dispute.
4. **Management visibility.** The dashboard gives a reliable, at-a-glance summary of committed business.

## 2. Roles and permissions

| Capability | Clerk | Manager |
|---|---|---|
| Sign in / sign out | Yes | Yes |
| View Dashboard, Bookings, Inventory, Customers | Yes | Yes |
| Create a booking (Draft) | Yes | Yes |
| Confirm a reservation | Yes | Yes |
| Check out a Reserved booking | Yes | Yes |
| Record a return | Yes | Yes |
| Cancel a Draft booking | Yes | Yes |
| Cancel a Reserved booking | No | Yes |
| Change an equipment daily rate | No | Yes |
| Place a customer on hold / release a hold | No | Yes |
| View and change Settings | No | Yes |

The header shows the signed-in user's name and role on every page. Users who are not signed in are sent to the sign-in page. An attempt to use a capability the user's role does not have must be refused with an "access denied" message, and must not change any data.

## 3. Entities

**Equipment line** — name, daily rate (per unit), total stock (units owned), units reserved or on hire, units available.

**Customer** — name, phone, account status (*Active* or *On hold*), count of open bookings (Draft, Reserved or On Hire).

**Booking** — reference (B-nnnn), customer, one equipment line, quantity, start date, end date, chargeable days, daily rate, gross hire, weekly discount, hire charge, deposit, status, created by, notes, history.

**Settings** — deposit rate (%), maximum hire length (days).

### 3.1 Booking lifecycle

```
Draft ──confirm──> Reserved ──check out──> On Hire ──record return──> Returned
  │                   │
  └──── cancel ───────┴──> Cancelled
```

| Status | Meaning |
|---|---|
| Draft | Details captured and priced; no stock is held. |
| Reserved | Customer has committed; stock is held for the booking and the deposit is fixed. |
| On Hire | Equipment has left the depot. |
| Returned | Equipment is back in the depot. Final state. |
| Cancelled | Booking abandoned before check-out. Final state. |

No other transitions are permitted. In particular an On Hire booking cannot be cancelled, and Returned and Cancelled bookings cannot be changed.

## 4. Business rules

**Pricing**

- **BR-01** Chargeable days = end date minus start date, in days, with a minimum of 1 (a same-day hire is charged as 1 day). The end date may not be before the start date.
- **BR-02** Gross hire = daily rate × quantity × chargeable days.
- **BR-03** A weekly discount of 10% of gross hire applies to any hire of 7 chargeable days or more. Shorter hires receive no discount. Hire charge = gross hire − weekly discount.
- **BR-04** The daily rate used for a booking is the equipment line's rate at the moment the booking is created. A later rate change by a Manager applies to bookings created after the change only.
- **BR-05** The deposit is the hire charge multiplied by the deposit rate from Settings. While a booking is a Draft, the deposit shown is an estimate at the current deposit rate. When the reservation is confirmed, the deposit and the rate used are fixed on the booking; later changes to the deposit rate must not alter the deposit of any booking that is already Reserved, On Hire or Returned.

**Booking validation**

- **BR-06** Customer, equipment, quantity (whole number, 1 or more), start date and end date are mandatory.
- **BR-07** Chargeable days may not exceed the maximum hire length in Settings.
- **BR-08** A new booking cannot be created for a customer whose account is On hold.

**Stock**

- **BR-09** For each equipment line, Available = Total stock − units on Reserved bookings − units on On Hire bookings. Draft, Returned and Cancelled bookings hold no stock.
- **BR-10** A reservation can be confirmed only if the booking quantity does not exceed the units currently available. Otherwise the booking stays a Draft and the user is told how many units are available.
- **BR-11** Stock held by a booking is released as soon as the booking is Returned or Cancelled, and is immediately reflected in Inventory.

**Permissions**

- **BR-12** Only a Manager may cancel a Reserved booking. Clerks and Managers may cancel a Draft.
- **BR-13** Only a Manager may place a customer on hold or release a hold.
- **BR-14** Only a Manager may view or change Settings, or change an equipment daily rate.

**Reporting**

- **BR-15** The dashboard shows the number of bookings in each status.
- **BR-16** *Booked hire value* on the dashboard is the sum of the hire charge of all bookings that are Reserved, On Hire or Returned. Draft and Cancelled bookings are not committed business and are excluded.
- **BR-17** *Units reserved or on hire* on the dashboard is the total, across all equipment lines, of the units held under BR-09.

**Settings**

- **BR-18** Deposit rate is a whole number from 0 to 100. Maximum hire length is a whole number from 1 to 365. Invalid values are rejected and the previous values kept.

## 5. Workflows

### 5.1 Take a booking (New booking → Review → Booking detail)

1. The user opens **Bookings → New booking**, chooses customer and equipment, enters quantity, start and end dates and optional notes, and selects **Continue to review**.
2. If validation fails (BR-01, BR-06 to BR-08) the form is redisplayed with an error message and the values entered; nothing is saved.
3. Otherwise the booking is saved as a **Draft** and the **Review** screen shows the full price breakdown (chargeable days, daily rate, gross hire, weekly discount, hire charge, estimated deposit) and current availability of the equipment line.
4. From Review the user may **Confirm reservation** (BR-10; the booking becomes Reserved and the booking detail screen is shown), **Cancel booking**, or go back to the bookings list leaving the Draft for later.
5. A Draft can be reopened from the bookings list and taken to Review at any time.

### 5.2 Hand out and receive equipment

1. On a Reserved booking the user selects **Check out**; the booking becomes On Hire.
2. On an On Hire booking the user selects **Record return**; the booking becomes Returned and the stock is released (BR-11).

### 5.3 Cancel a booking

From the booking detail (or Review, for a Draft) the user selects **Cancel booking**. The control is offered only to users permitted by BR-12. The booking becomes Cancelled and any stock it held is released (BR-11).

### 5.4 Maintain configuration (Manager)

- **Settings**: change deposit rate and maximum hire length (BR-18).
- **Inventory**: change the daily rate of an equipment line (BR-04).
- **Customers**: place a customer on hold or release the hold (BR-08, BR-13).

Every successful action is confirmed with a status message; every refused action explains why. Each booking keeps a history of its status changes and who made them.

## 6. Module dependencies

| Module | Depends on | Effect |
|---|---|---|
| Bookings | Inventory | Daily rate copied at creation (BR-04); availability checked at confirmation (BR-10). |
| Bookings | Customers | Hold status checked when a booking is created (BR-08). |
| Bookings | Settings | Maximum hire length (BR-07); deposit rate (BR-05). |
| Inventory | Bookings | Reserved / on hire and Available figures derive from booking statuses (BR-09, BR-11). |
| Customers | Bookings | Open bookings count per customer. |
| Dashboard | Bookings, Inventory, Settings | Status counts, booked hire value, units held, current deposit rate (BR-15 to BR-17). |

## 7. Non-functional notes

- Server-rendered pages, usable with keyboard and assistive technology; error messages are announced as alerts and confirmations as status messages.
- The application version is displayed in the page footer.
- Money is shown in pounds sterling to two decimal places.
- The test build holds data in memory and resets to the standard seed data on restart.
