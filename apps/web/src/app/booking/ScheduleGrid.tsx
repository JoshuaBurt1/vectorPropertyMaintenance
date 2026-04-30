// web/src/app/booking/ScheduleGrid.tsx
"use client";

import React from "react";

export type TimeSlot = "Morning (8AM - 12PM)" | "Afternoon (12PM - 4PM)" | "Evening (4PM - 8PM)";

export interface Booking {
  date: string;
  timeSlot: string;
  count: number;
}

export interface SearchedBooking {
  name: string;
  date: string;
  timeSlot: string;
  period: string;
  service: string;
  documentId: string;   
  bookingIndex: number;
  transactionId: string;
}

interface ScheduleGridProps {
  days: Date[];
  timeSlots: TimeSlot[];
  isLoading: boolean;
  bookedSlots: Booking[];
  justBooked: { date: string; time: string } | null;
  searchedBookings: SearchedBooking[];
  handleBlockClick: (date: Date, time: TimeSlot) => void;
}

const SkeletonSlot = () => (
  <div className="p-4 border border-zinc-200 rounded-xl h-24 bg-white animate-pulse flex flex-col justify-between">
    <div className="h-4 w-20 bg-zinc-200 rounded" />
    <div className="h-3 w-16 bg-zinc-100 rounded" />
  </div>
);

export default function ScheduleGrid({
  days,
  timeSlots,
  isLoading,
  bookedSlots,
  justBooked,
  searchedBookings,
  handleBlockClick,
}: ScheduleGridProps) {
  
  const getSlotFullness = (day: Date, time: string) => {
    const dayString = day.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
    const slot = bookedSlots.find((b) => b.date === dayString && b.timeSlot === time);
    return slot ? slot.count : 0;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
      {days.map((day, index) => (
        <div key={index} className="flex flex-col gap-3">
          <div className="text-center pb-2 border-b border-zinc-200">
            <div className="font-bold">{day.toLocaleDateString('en-CA', { weekday: 'short' })}</div>
            <div className="text-sm text-zinc-500">{day.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</div>
          </div>

          {timeSlots.map((time) => {
            if (isLoading) return <SkeletonSlot key={time} />;

            const dayStrToronto = day.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
            const todayStrToronto = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });

            const isPastDay = dayStrToronto < todayStrToronto;
            const isToday = dayStrToronto === todayStrToronto;

            const estTimezone = parseInt(
              new Intl.DateTimeFormat('en-US', {
                hour: 'numeric',
                hour12: false,
                timeZone: 'America/Toronto',
              }).format(new Date())
            );

            let isPastSlot = false;
            if (isToday) {
              if (time.startsWith("Morning") && estTimezone >= 8) isPastSlot = true;
              if (time.startsWith("Afternoon") && estTimezone >= 12) isPastSlot = true;
              if (time.startsWith("Evening") && estTimezone >= 16) isPastSlot = true;
            }

            const fullnessCount = getSlotFullness(day, time);
            const isFullyBooked = fullnessCount >= 2;
            const isUnavailable = isFullyBooked || isPastDay || isPastSlot;

            const isPast = isPastDay || isPastSlot;
            const isRecentlyBooked = justBooked?.date === dayStrToronto && justBooked?.time === time;
            const isSearched = searchedBookings.some(b => b.date === dayStrToronto && b.timeSlot === time);
            
            // Highlight if just booked OR if found via search
            const isHighlighted = isRecentlyBooked || isSearched;

            let statusLabel = "0% Full";
            let fullnessClass = "text-blue-600";

            if (isRecentlyBooked) {
              statusLabel = "Booked by You!";
              fullnessClass = "text-blue-700 font-bold";
            } else if (isSearched) {
              statusLabel = "Found Booking";
              fullnessClass = "text-blue-700 font-bold";
            } else if (isPast) {
              statusLabel = "Unavailable";
              fullnessClass = "text-zinc-400";
            } else if (isFullyBooked) {
              statusLabel = "100% Full";
              fullnessClass = "text-blue-600 font-semibold";
            } else if (fullnessCount === 1) {
              statusLabel = "50% Full";
              fullnessClass = "text-blue-400";
            } else {
              statusLabel = "0% Full";
              fullnessClass = "text-zinc-600";
            }

            return (
              <button
                key={time}
                disabled={isUnavailable}
                onClick={() => handleBlockClick(day, time)}
                className={`p-4 text-left text-sm border rounded-xl h-24 flex flex-col justify-between transition-all ${
                  isHighlighted
                    ? "bg-blue-50 border-blue-500 ring-2 ring-blue-500 shadow-md" 
                    : isUnavailable
                    ? "bg-zinc-200/50 border-zinc-200 text-zinc-400 cursor-default"
                    : "bg-white border-zinc-200 hover:border-black hover:shadow-md"
                }`}
              >
                <span className={`font-medium ${isPastDay || isPastSlot ? "line-through text-zinc-400" : "text-zinc-700"}`}>
                  {time.split(" ")[0]}
                </span>
                <div className="flex flex-col gap-1">
                  <span className="text-xs opacity-75">{time.split(" ").slice(1).join(" ")}</span>
                  <span className={`text-xs ${fullnessClass}`}>{statusLabel}</span>
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}