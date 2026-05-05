import "./globals.css";

export const metadata = {
  title: "Juja Brew and Bites",
  description: "Premium Coffee, Tea, and Exquisite Bites",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* This meta tag is the secret to perfect mobile app scaling! */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
      </head>
      <body className="antialiased text-slate-800 min-h-screen flex flex-col selection:bg-rose-200 selection:text-rose-900">
        {/* 
          All your pages (Public, Admin, Customer) will automatically 
          render inside this 'children' block, inheriting the Abadi font 
          and responsive scaling automatically! 
        */}
        {children}
      </body>
    </html>
  );
}