import "./globals.css";

// Ensure there is a comma between 'title' and 'description'
export const metadata = {
  title: "Juja Brew and Bites",
  description: "Modern cafe in Pasong Tamo, Quezon City",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}