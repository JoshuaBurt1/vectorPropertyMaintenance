// web/src/app/booking/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { PayPalScriptProvider } from "@paypal/react-paypal-js";
import dynamic from 'next/dynamic';
import BookingModal from "./BookingModal";
import ScheduleGrid, { TimeSlot, Booking, SearchedBooking } from "./ScheduleGrid";
import 'leaflet/dist/leaflet.css';

const API_BASE = typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:8080"
    : "https://vectorpropertymaintenance.onrender.com";

const OPENCAGE_API_KEY = process.env.NEXT_PUBLIC_OPENCAGE_API_KEY;
const HOME_BASE = { lat: 44.3894, lng: -79.6903 }; 
const MAX_RADIUS_KM = 75;

const MapView = dynamic(() => import("./BookingMap"), { 
  ssr: false,
  loading: () => <div className="h-full w-full bg-zinc-100 animate-pulse" />
});

const getStartOfWeek = (date: Date) => {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
};

// Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
}

export default function BookingPage() {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => getStartOfWeek(new Date()));
  const [currentTime, setCurrentTime] = useState("");
  const [userTimezone, setUserTimezone] = useState("");
  const [days, setDays] = useState<Date[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<{ date: Date; time: TimeSlot } | null>(null);
  const [bookedSlots, setBookedSlots] = useState<Booking[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    email: "", 
    phone: "",
    service: "Grass Cutting",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showWarmingUp, setShowWarmingUp] = useState(false);

  // Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchedBookings, setSearchedBookings] = useState<SearchedBooking[]>([]);

  // Map & Location States
  const [isMapVisible, setIsMapVisible] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [isAddressValid, setIsAddressValid] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [justBooked, setJustBooked] = useState<{ date: string; time: string } | null>(null);

  const timeSlots: TimeSlot[] = [
    "Morning (8AM - 12PM)",
    "Afternoon (12PM - 4PM)",
    "Evening (4PM - 8PM)",
  ];
  const hasPropertyNumber = /^\d+/.test(formData.address.trim());
  const phoneRegex = /^(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/;
  const isPhoneValid = phoneRegex.test(formData.phone.trim());

  const services = ["Grass Cutting", "Leaf & Wood Removal", "Pool Cleaning", "Snow Shovelling", "Residential Cleaning", "Warehouse Cleaning"];  

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startOfActualWeek = new Date(today);
  startOfActualWeek.setDate(today.getDate() - today.getDay());
  startOfActualWeek.setHours(0, 0, 0, 0);

  const isAtMinWeek = currentWeekStart.getTime() <= startOfActualWeek.getTime();

  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE}/api/schedule/stream`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "REFRESH_SCHEDULE") {
        fetchBookings();
      }
    };

    return () => eventSource.close();
  }, []);

  useEffect(() => {
    setMounted(true);
    
    // Leaflet icons
    if (typeof window !== 'undefined') {
      import('leaflet').then((L) => {
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        });
      });
    }
  }, []);

  useEffect(() => {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(currentWeekStart);
      day.setDate(currentWeekStart.getDate() + i);
      week.push(day);
    }
    setDays(week);
  }, [currentWeekStart]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

      const shortTZ = new Intl.DateTimeFormat('en-US', { 
        timeZoneName: 'short' 
      }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value;
      
      setUserTimezone(shortTZ || "");
    };

    updateTime();
    const timer = setInterval(updateTime, 60000); 
    return () => clearInterval(timer);
  }, []);

  const fetchBookings = async () => {
    setIsLoading(true);
    
    const warmingTimer = setTimeout(() => {
      setShowWarmingUp(true);
    }, 2000);

    try {
      const response = await fetch(`${API_BASE}/api/schedule`);
      if (response.ok) {
        const data = await response.json();
        setBookedSlots(data);
      }
    } catch (error) {
      console.error("Failed to fetch schedule data:", error);
    } finally {
      clearTimeout(warmingTimer);
      setIsLoading(false);
      setShowWarmingUp(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const shiftWeek = (offset: number) => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(currentWeekStart.getDate() + offset * 7);
    setCurrentWeekStart(newStart);
  };

  const handleBlockClick = (date: Date, time: TimeSlot) => {
    setSelectedBlock({ date, time });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsMapVisible(false);
    setUserLocation(null);
    setIsAddressValid(false);
    setFormData({ name: "", address: "", email: "", phone: "", service: "Grass Cutting" }); // Reset phone
  };

  const handleBookingSubmission = async (transactionId: string) => {
  if (!selectedBlock) return;
  setIsSubmitting(true);

  try {
    const response = await fetch(`${API_BASE}/api/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...formData,
        date: selectedBlock.date.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }),
        timeSlot: selectedBlock.time,
        transactionId,
        location: userLocation ? [userLocation.lat, userLocation.lng] : null
      }),
    });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
            alert("CRITICAL: Payment went through but the slot was taken. Please contact us immediately for a refund or manual booking.");
            return;
        }
        throw new Error(result.error || "Failed to book");
      }

      alert("Booking confirmed!");
      
      setJustBooked({
        date: selectedBlock.date.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }),
        time: selectedBlock.time
      });

      setTimeout(() => setJustBooked(null), 5000);
      closeModal();
      fetchBookings();

    } catch (error: any) {
      console.error(error);
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // User Search Functionality
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchedBookings([]);
      return;
    }
    
    setIsSearching(true);
    try {
      const response = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(searchQuery)}`);
      if (response.ok) {
        const results = await response.json();
        if (results && results.length > 0) {
          // Sort results chronologically
          const sorted = results.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
          
          // Get earliest date found and set the calendar to that week
          const earliestBooking = sorted[0];
          setCurrentWeekStart(getStartOfWeek(new Date(earliestBooking.date)));
          
          // Save all matching slots to be highlighted by the Grid component
          setSearchedBookings(sorted);
        } else {
          alert("No bookings found for that information.");
          setSearchedBookings([]);
        }
      } else {
        alert("Search failed. Please try again.");
      }
    } catch (error) {
      console.error("Search error:", error);
      alert("Error reaching the database.");
    } finally {
      setIsSearching(false);
    }
  };

  // Geocoding Logic: Universal function for both forward and reverse geocoding
  const handleGeocode = async (query: string, isReverse = false) => {
    setIsGeocoding(true);
    const url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(query)}&key=${OPENCAGE_API_KEY}`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.results.length > 0) {
        const result = data.results[0];
        const lat = result.geometry.lat;
        const lng = result.geometry.lng;
        
        setUserLocation({ lat, lng });
        setFormData(prev => ({ ...prev, address: result.formatted }));
        
        const distance = calculateDistance(HOME_BASE.lat, HOME_BASE.lng, lat, lng);
        setIsAddressValid(distance <= MAX_RADIUS_KM);
      } else {
        alert("Could not find this location.");
        setIsAddressValid(false);
      }
    } catch (err) {
      console.error("Geocoding failed:", err);
      alert("Address search failed. Please try again.");
    } finally {
      setIsGeocoding(false);
      setIsMapVisible(true);
    }
  };

  // 1. Browser HTML5 Geolocation -> Reverse Geocode
  const getUserLocation = () => {
    if ("geolocation" in navigator) {
      setIsGeocoding(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          handleGeocode(`${lat},${lng}`, true);
        },
        (error) => {
          console.error("Error getting location:", error);
          alert("Please allow location access or type your address manually.");
          setIsGeocoding(false);
        }
      );
    } else {
      alert("Geolocation is not supported by your browser");
    }
  };

  const isFormValid = 
    formData.name.trim() !== "" && 
    isAddressValid && 
    hasPropertyNumber &&
    isPhoneValid &&
    formData.email.includes("@");

  return (
    <PayPalScriptProvider 
      options={{ 
        clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "test",
        currency: "CAD", 
        intent: "capture"
      }}
    >
      <div className="min-h-screen flex flex-col bg-white text-zinc-900 font-sans">
        
        {/* HEADER */}
        <nav className="flex items-center justify-between px-8 py-6 border-b border-zinc-100 bg-white">
          <div className="flex grow items-center gap-4">
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

          <div className="flex flex-col items-end gap-2 shrink-0">
            <Link 
              href="/"
              className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-zinc-800 transition-all active:scale-95"
            >
              Back to Home
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

        {/* MAIN BODY */}
        <main className="grow bg-white p-8">
          <div className="max-w-6xl mx-auto">

            <header className="mb-10 flex flex-col md:flex-row md:justify-between md:items-end gap-6">
              <div>
                <h1 className="text-4xl font-bold tracking-tight mb-2">Schedule Service</h1>
                <p className="text-zinc-600">Click on a schedule block to book your time.</p>
              </div>

              <div className="flex flex-col items-end gap-3 w-full md:w-auto min-h-10 justify-center">
                {showWarmingUp ? (
                  /* 1. Display ONLY the Warming Up Indicator if true */
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-full text-xs animate-pulse shadow-sm">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-500"></span>
                    </span>
                    Server Warming Up...
                  </div>
                ) : (
                  /* 2. ELSE display the Search Bar */
                  <div className="flex items-center gap-2 w-full md:w-auto">
                    <input
                      type="text"
                      placeholder="Find existing booking..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      className="px-4 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black w-full md:w-64"
                    />
                    <button
                      onClick={handleSearch}
                      disabled={isSearching}
                      className="px-6 py-2 bg-black text-white rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      {isSearching ? "..." : "Search"}
                    </button>
                  </div>
                )}
              </div>
            </header>

            {/* CONTROLS AREA (Week Navigation Only) */}
            <div className="flex items-center justify-between mb-6 bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
              <button 
                onClick={() => shiftWeek(-1)} 
                disabled={isAtMinWeek}
                className={`p-2 rounded-lg transition-colors ${
                  isAtMinWeek 
                    ? "opacity-0 cursor-default"
                    : "hover:bg-zinc-100 text-zinc-900"
                }`}
              >
                ← Previous Week
              </button>
              <span className="font-semibold text-lg">
                Week of {currentWeekStart.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}, {currentTime} ({userTimezone})
              </span>
              <button onClick={() => shiftWeek(1)} className="p-2 hover:bg-zinc-100 rounded-lg">
                Next Week →
              </button>
            </div>

            {/* Extracted Schedule Grid */}
            <ScheduleGrid 
              days={days}
              timeSlots={timeSlots}
              isLoading={isLoading}
              bookedSlots={bookedSlots}
              justBooked={justBooked}
              searchedBookings={searchedBookings}
              handleBlockClick={handleBlockClick}
            />

          </div>
        </main>
        
        {/* FOOTER */}
        <footer className="px-8 py-12 border-t border-zinc-100 text-center bg-white">
          <p className="text-xs text-zinc-400 uppercase tracking-widest">
            © {new Date().getFullYear()} Vector Property Maintenance
          </p>
        </footer>

        {/* Extracted Booking Modal */}
        <BookingModal
          isOpen={isModalOpen}
          selectedBlock={selectedBlock}
          closeModal={closeModal}
          isMapVisible={isMapVisible}
          setIsMapVisible={setIsMapVisible}
          mounted={mounted}
          userLocation={userLocation}
          HOME_BASE={HOME_BASE}
          MAX_RADIUS_KM={MAX_RADIUS_KM}
          MapView={MapView}
          formData={formData}
          setFormData={setFormData}
          getUserLocation={getUserLocation}
          handleGeocode={handleGeocode}
          isGeocoding={isGeocoding}
          isAddressValid={isAddressValid}
          hasPropertyNumber={hasPropertyNumber}
          isPhoneValid={isPhoneValid}
          services={services}
          isSubmitting={isSubmitting}
          isFormValid={isFormValid}
          handleBookingSubmission={handleBookingSubmission}
          API_BASE={API_BASE}
        />
      </div>
    </PayPalScriptProvider>
  );
}