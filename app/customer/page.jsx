import dynamic from "next/dynamic";

const CustomerClient = dynamic(() => import("./CustomerClient"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-[#FFF5F7]">
      <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
    </div>
  ),
});

export default function Page() {
  return <CustomerClient />;
}
