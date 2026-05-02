export const menuCategories = [
  "Signature", "Chicken", "Rice in a Box", "Rice Meal", "All Day Breakfast", 
  "Coffee", "Non-Coffee", "Signature Drinks", "Frappe", "Milk Tea", 
  "Snacks", "Waffle", "Pasta", "Croffle", "Group Tray"
];

export const menuItems = [
  // --- SIGNATURE BAKES ---
  { id: 1, name: "Dubai Chewy Cookie (Single)", category: "Signature", price: 159, is_featured: true, status: "available" },
  { id: 2, name: "Dubai Chewy Cookie (Box of 4)", category: "Signature", price: 599, is_featured: true, status: "available" },

  // --- CHICKEN ---
  { id: 3, name: "Chicken Wings (2 pcs with Rice)", category: "Chicken", price: 139, is_featured: false, status: "available" },
  { id: 4, name: "Chicken Wings (6 pcs Ala Carte)", category: "Chicken", price: 319, is_featured: true, status: "available" },
  { id: 5, name: "Boneless Chicken (7 pcs)", category: "Chicken", price: 259, is_featured: false, status: "available" },
  { id: 6, name: "Taiwan Large Chicken", category: "Chicken", price: 289, is_featured: true, status: "available" },

  // --- RICE IN A BOX ---
  { id: 7, name: "Tapa Rice", category: "Rice in a Box", price: 99, is_featured: false, status: "available" },
  { id: 8, name: "Seafood Bagoong", category: "Rice in a Box", price: 99, is_featured: false, status: "available" },
  { id: 9, name: "Korean Kimchi", category: "Rice in a Box", price: 99, is_featured: false, status: "available" },
  { id: 10, name: "Beef Pepper", category: "Rice in a Box", price: 149, is_featured: true, status: "available" },
  
  // --- RICE MEAL & BREAKFAST ---
  { id: 11, name: "Shawarma Rice", category: "Rice Meal", price: 129, is_featured: false, status: "available" },
  { id: 12, name: "Majh's Pork Sisig", category: "Rice Meal", price: 139, is_featured: true, status: "available" },
  { id: 13, name: "Japanese Chicken Curry", category: "Rice Meal", price: 199, is_featured: false, status: "available" },
  { id: 14, name: "Tapsilog", category: "All Day Breakfast", price: 149, is_featured: false, status: "available" },

  // --- COFFEE & SIGNATURE DRINKS ---
  { id: 15, name: "Americano (Iced)", category: "Coffee", price: 89, is_featured: false, status: "available" },
  { id: 16, name: "Spanish Latte (Iced)", category: "Coffee", price: 109, is_featured: false, status: "available" },
  { id: 17, name: "Salted Caramel Latte (Iced)", category: "Coffee", price: 119, is_featured: true, status: "available" },
  { id: 18, name: "Matcha Latte (Iced)", category: "Non-Coffee", price: 119, is_featured: false, status: "available" },
  { id: 19, name: "Taiwan Brown Sugar", category: "Signature Drinks", price: 139, is_featured: true, status: "available" },
  { id: 20, name: "Biscoff Foam Latte", category: "Signature Drinks", price: 149, is_featured: true, status: "available" },

  // --- MILK TEA ---
  { id: 21, name: "Black Pearl Milk Tea", category: "Milk Tea", price: 89, is_featured: false, status: "available" },
  { id: 22, name: "Nutella Milk Tea", category: "Milk Tea", price: 119, is_featured: false, status: "available" },
  { id: 23, name: "Milk Tea Cheesecake", category: "Milk Tea", price: 109, is_featured: true, status: "available" },
  { id: 24, name: "JUJA Trio Milk Tea", category: "Milk Tea", price: 119, is_featured: true, status: "available" },

  // --- SNACKS, PASTA & CROFFLE ---
  { id: 25, name: "Torched Cheesy Nachos", category: "Snacks", price: 179, is_featured: true, status: "available" },
  { id: 26, name: "Chicken Tenders Platter", category: "Snacks", price: 349, is_featured: false, status: "available" },
  { id: 27, name: "Jumak's Spaghetti", category: "Pasta", price: 149, is_featured: false, status: "available" },
  { id: 28, name: "Aoi's Truffle Cream", category: "Pasta", price: 199, is_featured: true, status: "available" },
  { id: 29, name: "Strawberry Cheesecake Croffle", category: "Croffle", price: 199, is_featured: false, status: "available" },

  // --- GROUP TRAY ---
  { id: 30, name: "Korean BBQ Chicken (Family)", category: "Group Tray", price: 849, is_featured: false, status: "available" },
  { id: 31, name: "Pork Sisig (Family)", category: "Group Tray", price: 599, is_featured: false, status: "available" },
  { id: 32, name: "Truffle Cream Pasta (Family)", category: "Group Tray", price: 999, is_featured: true, status: "available" },
];

export const getMenuItems = async () => {
  return new Promise((resolve) => {
    setTimeout(() => resolve(menuItems), 500); 
  });
};

// --- BACKWARD COMPATIBILITY PATCH ---
export const MenuItem = {
  filter: async () => menuItems.filter((item) => item.is_featured)
};

// Add the .list() function here so the Admin page stops crashing
export const Order = {
  list: async () => [] 
};

export const MenuCategory = {};