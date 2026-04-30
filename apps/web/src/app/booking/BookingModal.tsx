// web/src/app/booking/BookingModal.tsx
import React from "react";
import { PayPalButtons } from "@paypal/react-paypal-js";

export interface BookingModalProps {
  isOpen: boolean;
  selectedBlock: { date: Date; time: string } | null;
  closeModal: () => void;
  isMapVisible: boolean;
  setIsMapVisible: (visible: boolean) => void;
  mounted: boolean;
  userLocation: { lat: number; lng: number } | null;
  HOME_BASE: { lat: number; lng: number };
  MAX_RADIUS_KM: number;
  MapView: React.ComponentType<any>;
  formData: {
    name: string;
    address: string;
    email: string;
    phone: string;
    service: string;
  };
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  getUserLocation: () => void;
  handleGeocode: (query: string, isReverse?: boolean) => void;
  isGeocoding: boolean;
  isAddressValid: boolean;
  hasPropertyNumber: boolean;
  isPhoneValid: boolean;
  services: string[];
  isSubmitting: boolean;
  isFormValid: boolean;
  handleBookingSubmission: (transactionId: string) => Promise<void>;
  API_BASE: string;
}

export default function BookingModal({
  isOpen,
  selectedBlock,
  closeModal,
  isMapVisible,
  setIsMapVisible,
  mounted,
  userLocation,
  HOME_BASE,
  MAX_RADIUS_KM,
  MapView,
  formData,
  setFormData,
  getUserLocation,
  handleGeocode,
  isGeocoding,
  isAddressValid,
  hasPropertyNumber,
  isPhoneValid,
  services,
  isSubmitting,
  isFormValid,
  handleBookingSubmission,
  API_BASE,
}: BookingModalProps) {
  if (!isOpen || !selectedBlock) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div
        className={`bg-white rounded-2xl shadow-2xl flex flex-col md:flex-row transition-all duration-500 ease-in-out ${
          isMapVisible ? "max-w-4xl" : "max-w-md"
        } w-full max-h-[90vh] overflow-hidden`}
      >
        {/* Dynamic Map Area */}
        {isMapVisible && mounted && (
          <div className="hidden md:block w-1/2 bg-zinc-100 relative">
            <MapView
              userLocation={userLocation}
              homeBase={HOME_BASE}
              radius={MAX_RADIUS_KM}
            />
          </div>
        )}

        {/* Form Area */}
        <div
          className={`p-8 w-full ${
            isMapVisible ? "md:w-1/2 overflow-y-auto" : "overflow-y-auto"
          } relative z-10 bg-white`}
        >
          <h2 className="text-2xl font-bold mb-1">Confirm Booking</h2>
          <p className="text-sm text-zinc-500 mb-6">
            {selectedBlock.date.toLocaleDateString("en-CA")} • {selectedBlock.time}
          </p>

          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                required
                type="text"
                className="w-full border border-zinc-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-black"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 justify-between">
                Address
                <button
                  onClick={getUserLocation}
                  type="button"
                  className="text-blue-600 hover:text-blue-800 text-xs font-semibold ml-2"
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
                    formData.address && !isAddressValid && isMapVisible
                      ? "border-red-500"
                      : "border-zinc-300"
                  }`}
                  onFocus={() => setIsMapVisible(true)}
                  value={formData.address}
                  onChange={(e) => {
                    setFormData({ ...formData, address: e.target.value });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
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
                  Must verify an address within our 100km radius.
                </p>
              )}
              {isAddressValid && !hasPropertyNumber && (
                <p className="text-xs text-red-500 mt-1.5 font-medium">
                  ⚠️ Please include your house/property number at the start of the address.
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
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Phone Number</label>
              <input
                required
                type="tel"
                placeholder="(555) 555-5555"
                className={`w-full border rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-black ${
                  formData.phone && !isPhoneValid
                    ? "border-red-500 bg-red-50"
                    : "border-zinc-300"
                }`}
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
              />
              {formData.phone && !isPhoneValid && (
                <p className="text-xs text-red-500 mt-1.5 font-medium">
                  Please enter a valid 10-digit phone number.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Service Requirement</label>
              <select
                className="w-full border border-zinc-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-black"
                value={formData.service}
                onChange={(e) =>
                  setFormData({ ...formData, service: e.target.value })
                }
              >
                {services.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
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
              <p className="text-sm text-center text-zinc-500 my-2">
                Processing your booking...
              </p>
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
                    createOrder={async () => {
                      const response = await fetch(`${API_BASE}/api/paypal/create-order`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ serviceName: formData.service }),
                      });

                      const orderData = await response.json();

                      if (!response.ok) {
                        console.error("Backend Error Detail:", orderData);
                        throw new Error(orderData.error || "Failed to create PayPal order");
                      }

                      if (orderData.id) {
                        return orderData.id;
                      }

                      throw new Error("Failed to create PayPal order: No ID returned");
                    }}
                    onApprove={async (data) => {
                      try {
                        const response = await fetch(`${API_BASE}/api/paypal/capture-order`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ orderID: data.orderID }),
                        });

                        const details = await response.json();

                        if (!response.ok) {
                          throw new Error(
                            details.error || "Transaction failed to capture on server."
                          );
                        }

                        if (details.status === "COMPLETED") {
                          const transactionId =
                            details.purchase_units[0].payments.captures[0].id;
                          await handleBookingSubmission(transactionId);
                        } else {
                          throw new Error(
                            `Transaction was not completed. Status: ${details.status}`
                          );
                        }
                      } catch (error) {
                        console.error("PayPal Capture Error:", error);
                        alert("Payment failed to capture. Please try again.");
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
  );
}