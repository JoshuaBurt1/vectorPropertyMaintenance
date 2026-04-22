// web/src/app/booking/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

const API_BASE_URL = process.env.NODE_ENV === "production" 
  ? "https://vectorpropertymaintenance.onrender.com" 
  : "http://localhost:8080";

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
  const [isLoading, setIsLoading] = useState(true);

  const timeSlots: TimeSlot[] = [
    "Morning (8AM - 12PM)",
    "Afternoon (12PM - 4PM)",
    "Evening (4PM - 8PM)",
  ];

  const services = ["Grass Cutting", "Leaf & Wood Removal", "Pool Cleaning", "Residential Cleaning", "Warehouse Cleaning"];

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
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/schedule`);
      if (response.ok) {
        const data = await response.json();
        setBookedSlots(data);
      }
    } catch (error) {
      console.error("Failed to fetch schedule data:", error);
    } finally {
      setIsLoading(false);
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

  // Separated the actual API submission from the button click
  // so it can be called after PayPal approves the transaction
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
          transactionId, // Pass the PayPal transaction ID to your backend
        }),
      });

      if (!response.ok) throw new Error("Failed to book");

      alert("Booking and payment confirmed successfully!");
      setIsModalOpen(false);
      setFormData({ name: "", address: "", service: "Grass Cutting" });
      
      fetchBookings(); 
    } catch (error) {
      console.error(error);
      alert("Payment was successful, but there was an error saving your booking. Please contact support.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if form is filled out before allowing payment
  const isFormValid = formData.name.trim() !== "" && formData.address.trim() !== "";

  return (
    // Wrap the entire component (or just the app) in the PayPal Provider
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
                  if (isLoading) {
                    return <SkeletonSlot key={time} />;
                  }

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
                          ? "bg-zinc-200/50 border-zinc-200 text-zinc-400 cursor-not-allowed"
                          : "bg-white border-zinc-200 hover:border-black hover:shadow-md"
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
            <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl overflow-y-auto max-h-[90vh]">
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

                {/* Total/Deposit display */}
                <div className="bg-zinc-50 p-4 rounded-lg mt-2 border border-zinc-200">
                  <div className="flex justify-between text-sm">
                    <span>Deposit Required:</span>
                    <span className="font-bold">$50.00 CAD</span>
                  </div>
                </div>

                {isSubmitting && (
                  <p className="text-sm text-center text-zinc-500 my-2">Processing your booking...</p>
                )}

                {/* Actions */}
                <div className="mt-4 flex flex-col gap-3">
                  {!isFormValid ? (
                    <div className="text-center p-3 bg-zinc-100 text-zinc-500 rounded-lg text-sm border border-zinc-200">
                      Please fill out your Name and Address to proceed with payment.
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
                              
                              // Check if the id exists before passing it to your submission function
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
                    onClick={() => setIsModalOpen(false)}
                    disabled={isSubmitting}
                    className="w-full py-2.5 border border-zinc-300 rounded-lg font-medium hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PayPalScriptProvider>
  );
}