import "./style.css";
import PageTransition from "@/components/PageTransition";
import PwaManifestManager from "@/components/PwaManifestManager";

export const metadata = {
  title: "Juja Brew and Bites®",
  description: "Premium Coffee, Tea, and Exquisite Bites",
};

export default function RootLayout({ children }) {
  return (
    // Add suppressHydrationWarning to both html and body
    <html lang="en" className="hide-scrollbar" suppressHydrationWarning>
      <head>
        <meta 
          name="viewport" 
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" 
        />
      </head>
      <body 
        className="antialiased text-slate-800 min-h-screen flex flex-col bg-[#FFF5F7]"
        suppressHydrationWarning
      >
        <PwaManifestManager />
        <PageTransition>{children}</PageTransition>
      </body>
    </html>
  );
}
