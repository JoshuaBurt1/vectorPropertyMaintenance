// web/src/page.tsx
import Link from "next/link";
import Image from "next/image"; 
import Typewriter from "@/components/Typewriter";

export default function Home() {
  const services = [
    {
      title: 'Residential',
      description: 'Comprehensive cleaning tailored to your home, ensuring a safe and spotless living environment.'
    },
    {
      title: 'Commercial',
      description: 'Dependable custodial services that create a welcoming and professional workspace for your team.'
    },
    {
      title: 'Yard Work',
      description: 'Expert landscaping and seasonal upkeep to keep your property\'s exterior looking its absolute best.'
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-white text-zinc-900 font-sans">
      {/* Header Section */}
      <nav className="flex items-center justify-between px-8 py-6 border-b border-zinc-100">
        
        {/* Left Side: Logo & Name - Added grow to span space */}
        <div className="flex flex-grow items-center gap-4">
          <Image 
            src="/assets/icon.png"
            alt="Vector Property Maintenance Logo" 
            width={48} 
            height={48} 
            className="rounded-sm w-12 h-12 object-contain" 
            priority
          />
          <h1 className="text-2xl font-bold tracking-tighter uppercase">
            Vector Property Maintenance
          </h1>
        </div>

        {/* Right Side: Contact block */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <Link 
            href="/booking"
            className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-zinc-800 transition-all active:scale-95"
          >
            Schedule a Service
          </Link>
          
          <p className="text-zinc-500 text-xs">
            Have a custom project? {" "}
            <a 
              href="mailto:VectorPM@gmail.com" 
              className="text-zinc-900 font-medium underline underline-offset-4 hover:text-zinc-600 transition-colors"
            >
              VectorPM@gmail.com
            </a>
          </p>
        </div>
      </nav>

      <main className="grow max-w-4xl mx-auto px-8 py-20 text-center sm:text-left">
        <div className="inline-block px-3 py-1 mb-6 text-xs font-semibold tracking-widest uppercase bg-zinc-100 rounded-full">
          Professional Property Maintenance and Custodial Services
        </div>
        
        <h2 className="text-5xl sm:text-7xl font-bold tracking-tight mb-8">
          Reliable cleaning for your{" "}
          <span className="text-black inline-block">
            <Typewriter />
          </span>
        </h2>

        <p className="text-lg text-zinc-600 mb-10 max-w-2xl leading-relaxed">
          From yard work to scheduled maintenance, Vector provides 
          top-tier property care tailored to your specific schedule.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {services.map((service) => (
            <div key={service.title} className="p-6 border border-zinc-200 rounded-2xl hover:border-black transition-colors bg-white group flex flex-col">
              <h3 className="font-bold mb-2 group-hover:translate-x-1 transition-transform">
                {service.title}
              </h3>
              <p className="text-sm text-zinc-500">
                {service.description}
              </p>
            </div>
          ))}
        </div>
      </main>

      <footer className="px-8 py-12 border-t border-zinc-100 text-center">
        <p className="text-xs text-zinc-400 uppercase tracking-widest">
          © {new Date().getFullYear()} Vector Property Maintenance
        </p>
      </footer>
    </div>
  );
}