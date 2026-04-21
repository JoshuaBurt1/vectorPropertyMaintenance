// web/src/page.tsx
import Image from "next/image";
import Link from "next/link";
import Typewriter from "@/components/Typewriter";

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans">
      {/* Hero Section */}
      <nav className="flex items-center justify-between px-8 py-6 border-b border-zinc-100">
        <h1 className="text-xl font-bold tracking-tighter uppercase">Vector Property Maintenance</h1>
        <Link 
          href="/booking"
          className="bg-black text-white px-5 py-2 rounded-full text-sm font-medium hover:bg-zinc-800 transition-colors"
        >
          Book Now
        </Link>
      </nav>

      <main className="max-w-4xl mx-auto px-8 py-20 text-center sm:text-left">
        <div className="inline-block px-3 py-1 mb-6 text-xs font-semibold tracking-widest uppercase bg-zinc-100 rounded-full">
          Professional Cleaning Services
        </div>
        
        {/* Updated H2 with Typewriter */}
        <h2 className="text-5xl sm:text-7xl font-bold tracking-tight mb-8">
          Reliable cleaning for your{" "}
          <span className="text-black inline-block">
            <Typewriter />
          </span>
        </h2>

        <p className="text-lg text-zinc-600 mb-10 max-w-2xl leading-relaxed">
          From deep cleaning to scheduled maintenance, Vector provides 
          top-tier property care tailored to your specific schedule.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {['Residential', 'Commercial', 'Deep Clean'].map((service) => (
            <div key={service} className="p-6 border border-zinc-200 rounded-2xl hover:border-black transition-colors bg-white group">
              <h3 className="font-bold mb-2 group-hover:translate-x-1 transition-transform">{service}</h3>
              <p className="text-sm text-zinc-500">Professional grade equipment and eco-friendly solutions.</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}