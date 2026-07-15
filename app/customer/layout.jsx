export const metadata = {
  title: "JUJA Customer Portal",
  description: "Customer ordering, booking, and loyalty portal for Juja Brew & Bites.",
  applicationName: "JUJA Customer Portal",
  manifest: "/manifest-customer.json",
  appleWebApp: {
    capable: true,
    title: "JUJA Customer Portal",
    statusBarStyle: "default",
  },
};

export default function CustomerLayout({ children }) {
  return children;
}
