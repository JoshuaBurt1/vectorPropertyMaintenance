//src/app/booking/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

// --- ADD THIS CONSTANT AT THE TOP ---
const API_BASE_URL = process.env.NODE_ENV === "production" 
  ? "https://vectorpropertymaintenance.onrender.com" 
  : "http://localhost:8080";

type TimeSlot = "Morning (8AM - 12PM)" | "Afternoon (12PM - 4PM)" | "Evening (4PM - 8PM)";

interface Booking {
  date: string;
  timeSlot: string;
}

export default function BookingPage() {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(new Date());
  const [days, setDays] = useState<Date[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<{ date: Date; time: TimeSlot } | null>(null);
  
  // State to hold booked slots fetched from the server
  const [bookedSlots, setBookedSlots] = useState<Booking[]>([]);
  
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    service: "Grass Cutting",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const timeSlots: TimeSlot[] = [
    "Morning (8AM - 12PM)",
    "Afternoon (12PM - 4PM)",
    "Evening (4PM - 8PM)",
  ];

  const services = ["Grass Cutting", "Leave Pick-up", "Wood Removal", "Landscaping"];

  // Initialize the week starting from Sunday
  useEffect(() => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    start.setHours(0, 0, 0, 0);
    setCurrentWeekStart(start);
  }, []);

  // Update the 7-day array whenever the week start changes
  useEffect(() => {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(currentWeekStart);
      day.setDate(currentWeekStart.getDate() + i);
      week.push(day);
    }
    setDays(week);
  }, [currentWeekStart]);

  // Fetch all bookings from the server
  const fetchBookings = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/schedule`);
      if (response.ok) {
        const data = await response.json();
        setBookedSlots(data);
      }
    } catch (error) {
      console.error("Failed to fetch schedule data:", error);
    }
  };

  // Fetch bookings on component mount
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBlock) return;
    setIsSubmitting(true);

    try {
      // USE THE CONSTANT HERE
      const response = await fetch(`${API_BASE_URL}/api/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          date: selectedBlock.date.toISOString(),
          timeSlot: selectedBlock.time,
        }),
      });

      if (!response.ok) throw new Error("Failed to book");

      alert("Booking confirmed successfully!");
      setIsModalOpen(false);
      setFormData({ name: "", address: "", service: "Grass Cutting" });
      
      // Refresh the schedule immediately so the new booking gets greyed out
      fetchBookings(); 
    } catch (error) {
      console.error(error);
      alert("There was an error saving your booking.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans p-8">
      <div className="max-w-6xl mx-auto">
        <Link 
          href="/" 
          className="inline-flex items-center text-sm font-medium text-zinc-500 hover:text-black mb-8 transition-colors"
        >
          ← Back to Home
        </Link>

        <header className="mb-10">
          <h1 className="text-4xl font-bold tracking-tight mb-2">Schedule Service</h1>
          <p className="text-zinc-600">Click on a schedule block to book your time.</p>
        </header>

        {/* Calendar Controls */}
        <div className="flex items-center justify-between mb-6 bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
          <button onClick={() => shiftWeek(-1)} className="p-2 hover:bg-zinc-100 rounded-lg">
            ← Previous Week
          </button>
          <span className="font-semibold text-lg">
            Week of {currentWeekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
          <button onClick={() => shiftWeek(1)} className="p-2 hover:bg-zinc-100 rounded-lg">
            Next Week →
          </button>
        </div>

        {/* 7-Day Schedule Grid */}
        <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
          {days.map((day, index) => (
            <div key={index} className="flex flex-col gap-3">
              <div className="text-center pb-2 border-b border-zinc-200">
                <div className="font-bold">{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                <div className="text-sm text-zinc-500">{day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
              </div>
              
              {timeSlots.map((time) => {
                // Compare local date strings to avoid ISO timezone offset issues
                const isBooked = bookedSlots.some(
                  (b) => new Date(b.date).toDateString() === day.toDateString() && b.timeSlot === time
                );

                return (
                  <button
                    key={time}
                    disabled={isBooked}
                    onClick={() => handleBlockClick(day, time)}
                    className={`p-4 text-left text-sm border rounded-xl h-24 flex flex-col justify-between transition-all ${
                      isBooked 
                        ? "bg-zinc-200/50 border-zinc-200 text-zinc-400 cursor-not-allowed" // Booked styling
                        : "bg-white border-zinc-200 hover:border-black hover:shadow-md"     // Available styling
                    }`}
                  >
                    <span className={`font-medium ${isBooked ? "line-through text-zinc-400" : "text-zinc-700"}`}>
                      {time.split(" ")[0]} {isBooked && "(Booked)"}
                    </span>
                    <span className="text-xs opacity-75">
                      {time.split(" ").slice(1).join(" ")}
                    </span>
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
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h2 className="text-2xl font-bold mb-1">Confirm Booking</h2>
            <p className="text-sm text-zinc-500 mb-6">
              {selectedBlock.date.toLocaleDateString()} • {selectedBlock.time}
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
                <label className="block text-sm font-medium mb-1">Address</label>
                <input
                  required
                  type="text"
                  className="w-full border border-zinc-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-black"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
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

              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 border border-zinc-300 rounded-lg font-medium hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-black text-white rounded-lg font-medium hover:bg-zinc-800 disabled:opacity-50"
                >
                  {isSubmitting ? "Booking..." : "Confirm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}