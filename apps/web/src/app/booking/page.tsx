// web/src/app/booking/page.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import dynamic from 'next/dynamic';

const API_BASE_URL = process.env.NODE_ENV === "production" 
  ? "https://vectorpropertymaintenance.onrender.com" 
  : "http://localhost:8080";

const OPENCAGE_API_KEY = process.env.NEXT_PUBLIC_OPENCAGE_API_KEY;
const HOME_BASE = { lat: 44.3894, lng: -79.6903 }; 
const MAX_RADIUS_KM = 100;

const SkeletonSlot = () => (
  <div className="p-4 border border-zinc-200 rounded-xl h-24 bg-white animate-pulse flex flex-col justify-between">
    <div className="h-4 w-20 bg-zinc-200 rounded" />
    <div className="h-3 w-16 bg-zinc-100 rounded" />
  </div>
);

type TimeSlot = "Morning (8AM - 12PM)" | "Afternoon (12PM - 4PM)" | "Evening (4PM - 8PM)";

interface Booking {
  date: string;
  timeSlot: string;
  count: number;
}

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

// Dynamic import for Leaflet to prevent Next.js SSR "window is not defined" errors
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const Circle = dynamic(() => import('react-leaflet').then(mod => mod.Circle), { ssr: false });
import { useMap, useMapEvents } from "react-leaflet";

export default function BookingPage() {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(new Date());
  const [days, setDays] = useState<Date[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<{ date: Date; time: TimeSlot } | null>(null);
  const [bookedSlots, setBookedSlots] = useState<Booking[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    email: "", 
    service: "Grass Cutting",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showWarmingUp, setShowWarmingUp] = useState(false);

  // Map & Location States
  const [isMapVisible, setIsMapVisible] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [isAddressValid, setIsAddressValid] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [mounted, setMounted] = useState(false);

  const timeSlots: TimeSlot[] = [
    "Morning (8AM - 12PM)",
    "Afternoon (12PM - 4PM)",
    "Evening (4PM - 8PM)",
  ];

  const services = ["Grass Cutting", "Leaf & Wood Removal", "Pool Cleaning", "Snow Shovelling", "Residential Cleaning", "Warehouse Cleaning"];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startOfActualWeek = new Date(today);
  startOfActualWeek.setDate(today.getDate() - today.getDay());
  startOfActualWeek.setHours(0, 0, 0, 0);

  const isAtMinWeek = currentWeekStart.getTime() <= startOfActualWeek.getTime();

  useEffect(() => {
    setMounted(true);
    // Fix Leaflet icons in Next.js
    if (typeof window !== 'undefined') {
      import('leaflet').then((L) => {
        import('leaflet/dist/leaflet.css');
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        });
      });
    }

    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    start.setHours(0, 0, 0, 0);
    setCurrentWeekStart(start);
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

  const fetchBookings = async () => {
    setIsLoading(true);
    
    const warmingTimer = setTimeout(() => {
      setShowWarmingUp(true);
    }, 2000);

    try {
      const response = await fetch(`${API_BASE_URL}/api/schedule`);
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
    setFormData({ name: "", address: "", email: "", service: "Grass Cutting" });
  };

  const handleBookingSubmission = async (transactionId: string) => {
    if (!selectedBlock) return;
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          date: selectedBlock.date.toISOString(),
          timeSlot: selectedBlock.time,
          transactionId,
          location: userLocation ? [userLocation.lat, userLocation.lng] : null
        }),
      });

      if (!response.ok) {
        if (response.status === 409) {
            throw new Error("This slot just filled up. Please select another.");
        }
        throw new Error("Failed to book");
      }

      alert("Booking and payment confirmed successfully!");
      closeModal();
      fetchBookings(); 
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Payment was successful, but there was an error saving your booking. Please contact support.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Geocoding Logic ---
  
  // Universal function for both forward and reverse geocoding
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

  // 3. Map Click Event Component -> Reverse Geocode
  const MapClickHandler = () => {
    useMapEvents({
      click(e: any) {
        const { lat, lng } = e.latlng;
        handleGeocode(`${lat},${lng}`, true);
      },
    });
    return null;
  };

  // Component to fly to user location when it changes
  const MapUpdater = ({ center }: { center: { lat: number; lng: number } }) => {
    const map = useMap();
    useEffect(() => {
      if (map) {
        map.setView([center.lat, center.lng], map.getZoom());
      }
    }, [center, map]);
    
    return null;
  };

  const isFormValid = formData.name.trim() !== "" && isAddressValid && formData.email.includes("@");

  const getSlotFullness = (day: Date, time: string) => {
    const dayString = day.toISOString().split('T')[0];
    const slot = bookedSlots.find(b => b.date === dayString && b.timeSlot === time);
    return slot ? slot.count : 0;
  };

  return (
    <PayPalScriptProvider 
      options={{ 
        clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "test",
        currency: "CAD", 
        intent: "capture"
      }}
    >
      <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans p-8">
        <div className="max-w-6xl mx-auto">
          <Link 
            href="/" 
            className="inline-flex items-center text-sm font-medium text-zinc-500 hover:text-black mb-8 transition-colors"
          >
            ← Back to Home
          </Link>

          <header className="mb-10 flex justify-between items-start">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2">Schedule Service</h1>
              <p className="text-zinc-600">Click on a schedule block to book your time.</p>
            </div>
            
            {showWarmingUp && (
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-full text-sm animate-pulse">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-500"></span>
                </span>
                Server Warming Up...
              </div>
            )}
          </header>

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
              Week of {currentWeekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
            <button onClick={() => shiftWeek(1)} className="p-2 hover:bg-zinc-100 rounded-lg">
              Next Week →
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
            {days.map((day, index) => (
              <div key={index} className="flex flex-col gap-3">
                <div className="text-center pb-2 border-b border-zinc-200">
                  <div className="font-bold">{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                  <div className="text-sm text-zinc-500">{day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                </div>
                
                {timeSlots.map((time) => {
                  if (isLoading) return <SkeletonSlot key={time} />;

                  const isPastDay = day < today;
                  const currentHour = new Date().getHours();
                  let isPastSlot = false;
                  
                  if (day.toDateString() === today.toDateString()) {
                    if (time.startsWith("Morning") && currentHour >= 12) isPastSlot = true;
                    if (time.startsWith("Afternoon") && currentHour >= 16) isPastSlot = true;
                    if (time.startsWith("Evening") && currentHour >= 20) isPastSlot = true;
                  }

                  const fullnessCount = getSlotFullness(day, time);
                  const isFullyBooked = fullnessCount >= 2;
                  
                  const isUnavailable = isFullyBooked || isPastDay || isPastSlot;

                  let statusLabel = "0% Full";
                  let fullnessClass = "text-emerald-600";

                  if (isFullyBooked) {
                      statusLabel = "100% Full";
                      fullnessClass = "text-blue-600 font-semibold";
                  } else if (fullnessCount === 1) {
                      statusLabel = "50% Full";
                      fullnessClass = "text-amber-600";
                  } else if (isPastDay || isPastSlot) {
                      statusLabel = "Unavailable";
                      fullnessClass = "text-zinc-400";
                  }

                  return (
                    <button
                      key={time}
                      disabled={isUnavailable}
                      onClick={() => handleBlockClick(day, time)}
                      className={`p-4 text-left text-sm border rounded-xl h-24 flex flex-col justify-between transition-all ${
                        isUnavailable 
                          ? "bg-zinc-200/50 border-zinc-200 text-zinc-400 cursor-default" 
                          : "bg-white border-zinc-200 hover:border-black hover:shadow-md"
                      }`}
                    >
                      <span className={`font-medium ${isUnavailable && !isFullyBooked ? "line-through text-zinc-400" : "text-zinc-700"}`}>
                        {time.split(" ")[0]}
                      </span>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs opacity-75">
                          {time.split(" ").slice(1).join(" ")}
                        </span>
                        <span className={`text-xs ${fullnessClass}`}>
                          {statusLabel}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Booking Modal */}
        {isModalOpen && selectedBlock && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className={`bg-white rounded-2xl shadow-2xl flex flex-col md:flex-row transition-all duration-500 ease-in-out ${isMapVisible ? 'max-w-4xl' : 'max-w-md'} w-full max-h-[90vh] overflow-hidden`}>
              
              {/* Dynamic Map Area */}
              {isMapVisible && mounted && (
                <div className="hidden md:block w-1/2 bg-zinc-100 relative z-0">
                   <MapContainer 
                      center={[userLocation?.lat || HOME_BASE.lat, userLocation?.lng || HOME_BASE.lng]} 
                      zoom={userLocation ? 11 : 8} 
                      style={{ height: "100%", width: "100%" }}
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      
                      {/* Home Base & Service Radius */}
                      <Marker position={[HOME_BASE.lat, HOME_BASE.lng]} />
                      <Circle 
                        center={[HOME_BASE.lat, HOME_BASE.lng]} 
                        radius={MAX_RADIUS_KM * 1000} // Leaflet takes meters
                        pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 0.1 }}
                      />

                      {/* User Selected Location */}
                      {userLocation && (
                        <Marker position={[userLocation.lat, userLocation.lng]} />
                      )}

                      {/* Map Controls */}
                      <MapClickHandler />
                      {userLocation && <MapUpdater center={userLocation} />}
                    </MapContainer>
                </div>
              )}

              {/* Form Area */}
              <div className={`p-8 w-full ${isMapVisible ? 'md:w-1/2 overflow-y-auto' : 'overflow-y-auto'} relative z-10 bg-white`}>
                <h2 className="text-2xl font-bold mb-1">Confirm Booking</h2>
                <p className="text-sm text-zinc-500 mb-6">
                  {selectedBlock.date.toLocaleDateString()} • {selectedBlock.time}
                </p>

                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Name</label>
                    <input
                      required
                      type="text"
                      className="w-full border border-zinc-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-black"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1 justify-between">
                      Address
                      <button 
                        onClick={getUserLocation}
                        type="button"
                        className="text-blue-600 hover:text-blue-800 text-xs font-semibold"
                      >
                        📍 Use My Location
                      </button>
                    </label>
                    
                    {/* 2. Forward Geocoding Search */}
                    <div className="flex gap-2">
                      <input
                        required
                        type="text"
                        placeholder="Type address or click map..."
                        className={`w-full border rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-black ${
                          formData.address && !isAddressValid && isMapVisible ? 'border-red-500' : 'border-zinc-300'
                        }`}
                        onFocus={() => setIsMapVisible(true)}
                        value={formData.address}
                        onChange={(e) => {
                          setFormData({ ...formData, address: e.target.value });
                          setIsAddressValid(false); 
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleGeocode(formData.address);
                          }
                        }}
                      />
                      <button 
                        type="button"
                        onClick={() => handleGeocode(formData.address)}
                        disabled={isGeocoding || !formData.address}
                        className="bg-black text-white px-4 rounded-lg font-medium hover:bg-zinc-800 disabled:opacity-50 whitespace-nowrap"
                      >
                        {isGeocoding ? "..." : "Search"}
                      </button>
                    </div>
                    
                    {/* Address Validation Feedback */}
                    {isMapVisible && formData.address && !isAddressValid && !isGeocoding && (
                      <p className="text-xs text-red-500 mt-1.5 font-medium">
                        Must verify an address within our 100km radius. Try searching or clicking the map.
                      </p>
                    )}
                    {isAddressValid && !isGeocoding && (
                      <p className="text-xs text-emerald-600 mt-1.5 font-medium">
                        ✓ Address verified within service area
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Email Address</label>
                    <input
                      required
                      type="email"
                      placeholder="for your confirmation receipt"
                      className="w-full border border-zinc-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-black"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Service Requirement</label>
                    <select
                      className="w-full border border-zinc-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-black"
                      value={formData.service}
                      onChange={(e) => setFormData({ ...formData, service: e.target.value })}
                    >
                      {services.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div className="bg-zinc-50 p-4 rounded-lg mt-2 border border-zinc-200">
                    <div className="flex justify-between text-sm">
                      <span>Deposit Required:</span>
                      <span className="font-bold">$50.00 CAD</span>
                    </div>
                  </div>

                  {isSubmitting && (
                    <p className="text-sm text-center text-zinc-500 my-2">Processing your booking...</p>
                  )}

                  <div className="mt-4 flex flex-col gap-3">
                    {!isFormValid ? (
                      <div className="text-center p-3 bg-zinc-100 text-zinc-500 rounded-lg text-sm border border-zinc-200">
                        Please fill out Name, Email, and verify your Address to proceed.
                      </div>
                    ) : (
                      <div className="min-h-37.5">
                        <PayPalButtons
                          style={{ layout: "vertical", shape: "rect" }}
                          disabled={isSubmitting}
                          createOrder={(data, actions) => {
                            return actions.order.create({
                              intent: "CAPTURE",
                              purchase_units: [
                                {
                                  description: `${formData.service} - Booking Deposit`,
                                  amount: {
                                    currency_code: "CAD",
                                    value: "50.00",
                                  },
                                },
                              ],
                            });
                          }}
                          onApprove={async (data, actions) => {
                            if (actions.order) {
                              try {
                                const details = await actions.order.capture();
                                
                                if (details?.id) {
                                  await handleBookingSubmission(details.id);
                                } else {
                                  throw new Error("PayPal captured payment but did not return a Transaction ID.");
                                }
                                
                              } catch (error) {
                                console.error("PayPal Capture Error:", error);
                                alert("Payment failed to capture. Please try again.");
                              }
                            }
                          }}
                        />
                      </div>
                    )}
                    
                    <button
                      type="button"
                      onClick={closeModal}
                      disabled={isSubmitting}
                      className="w-full py-2.5 border border-zinc-300 rounded-lg font-medium hover:bg-zinc-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PayPalScriptProvider>
  );
}