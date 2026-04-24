// src/app/booking/BookingMap.tsx
"use client";

import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";

// Fix for Leaflet icons
const icon = L.icon({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function MapUpdater({ center }: { center: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    if (map) {
      map.setView([center.lat, center.lng]);
      map.invalidateSize();
    }
  }, [center, map]);
  return null;
}

export default function BookingMap({ userLocation, homeBase, radius, onMapClick }: any) {
  return (
    <MapContainer
      center={[userLocation?.lat || homeBase.lat, userLocation?.lng || homeBase.lng]}
      zoom={userLocation ? 11 : 8}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={[homeBase.lat, homeBase.lng]} icon={icon} />
      <Circle
        center={[homeBase.lat, homeBase.lng]}
        radius={radius * 1000}
        pathOptions={{ color: 'blue', fillOpacity: 0.1 }}
      />
      {userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={icon} />}
      <MapUpdater center={userLocation || homeBase} />
    </MapContainer>
  );
}