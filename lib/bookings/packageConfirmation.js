const SHARED_AMENITIES = [
  "Use of entertainment amenities: Videoke, YouTube, and Netflix.",
  "Fully air-conditioned private room.",
  "High-speed WiFi access.",
];

const PACKAGE_CONFIRMATION_DETAILS = {
  1: {
    capacity: 15,
    consumableAmount: 2500,
    additionalGuests: "Additional guests require PHP 300 worth of food and drinks per person (maximum of 5).",
    inclusions: ["PHP 2,500 worth of food and drinks (customizable selection).", ...SHARED_AMENITIES],
    foodPolicy: "Outside food and beverages are subject to corkage fees.",
    corkage: ["Alcoholic and non-alcoholic drinks: PHP 250", "Cakes: Free", "Other food: PHP 200 per dish"],
  },
  2: {
    capacity: 30,
    consumableAmount: 5500,
    additionalGuests: "Additional guests require PHP 300 worth of food and drinks per person (maximum of 5).",
    inclusions: ["PHP 5,500 worth of food and drinks (customizable selection).", ...SHARED_AMENITIES],
    foodPolicy: "Outside food and beverages are subject to corkage fees.",
    corkage: ["Alcoholic and non-alcoholic drinks: PHP 500", "Cakes: Free", "Other food: PHP 200 per dish"],
  },
  3: {
    capacity: 60,
    consumableAmount: 12000,
    additionalGuests: "Additional guests require PHP 300 worth of food and drinks per person (maximum of 5).",
    inclusions: [
      "PHP 12,000 worth of food and drinks (customizable selection).",
      "Exclusive use of the entire store during the booking.",
      ...SHARED_AMENITIES,
    ],
    foodPolicy: "Outside food and beverages are subject to corkage fees.",
    corkage: ["Alcoholic and non-alcoholic drinks: PHP 1,000", "Cakes: Free", "Other food: PHP 200 per dish"],
  },
  4: {
    capacity: 15,
    consumableAmount: null,
    additionalGuests: "Additional guests cost PHP 150 per person (maximum of 5).",
    inclusions: ["Corkage for food and drinks is included.", ...SHARED_AMENITIES],
    foodPolicy: "Outside food and beverages are allowed.",
    corkage: [],
  },
  5: {
    capacity: 30,
    consumableAmount: null,
    additionalGuests: "Additional guests cost PHP 150 per person (maximum of 5).",
    inclusions: ["Corkage for food and drinks is included.", ...SHARED_AMENITIES],
    foodPolicy: "Outside food and beverages are allowed.",
    corkage: [],
  },
  6: {
    capacity: 60,
    consumableAmount: null,
    additionalGuests: "Additional guests are free.",
    inclusions: [
      "Corkage for food and drinks is included.",
      "Exclusive use of the entire store during the booking.",
      ...SHARED_AMENITIES,
    ],
    foodPolicy: "Outside food and beverages are allowed.",
    corkage: [],
  },
};

export function packageConfirmationDetails(packageId) {
  return PACKAGE_CONFIRMATION_DETAILS[Number(packageId)] || {
    capacity: null,
    consumableAmount: null,
    additionalGuests: "",
    inclusions: [],
    foodPolicy: "",
    corkage: [],
  };
}
