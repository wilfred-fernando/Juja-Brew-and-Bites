"use client";

import { ShoppingBag, Receipt, Clock3, Package, ChefHat, Settings, CalendarDays, UserRound, LogOut } from "lucide-react";

export const POS_SECTIONS = [
  ["receipts", "Receipts", Receipt],
  ["shift", "Shift", Clock3],
  ["items", "Items", Package],
  ["recipes", "Recipes", ChefHat],
  ["settings", "Settings", Settings],
];

export default function PosNavigation({ active, onManagement, onSale, onBookings, onAccount, onSignOut, cashier }) {
  return (
    <aside className="pos-navigation" aria-label="Point of sale navigation">
      <div className="pos-navigation-brand"><span role="img" aria-label="JUJA Brew and Bites" /><small>POINT OF SALE</small></div>
      <nav aria-label="POS sections">
        <button type="button" aria-current={!active ? "page" : undefined} onClick={onSale}><ShoppingBag size={19} /><span>New sale</span></button>
        {POS_SECTIONS.map(([key, label, Icon]) => <button key={key} type="button" aria-current={active === key ? "page" : undefined} onClick={() => onManagement(key)}><Icon size={19} /><span>{label}</span></button>)}
        <button type="button" onClick={onBookings}><CalendarDays size={19} /><span>Bookings</span></button>
      </nav>
      <div className="pos-navigation-account">
        <button type="button" onClick={onAccount}><UserRound size={19} /><span>{cashier || "Cashier"}<small>Account &amp; store</small></span></button>
        <button type="button" onClick={onSignOut}><LogOut size={17} /><span>Sign out</span></button>
      </div>
    </aside>
  );
}
