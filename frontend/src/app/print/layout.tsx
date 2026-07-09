export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white min-h-screen text-black font-cairo" dir="rtl">
      {children}
    </div>
  );
}
