// src/app/booking/BookingMap.tsx
"use client";

import { MapContainer, TileLayer, Marker, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";

// 1. Custom Business Icon using your logo
const businessIcon = L.icon({
  iconUrl: '/assets/homeIcon.png',
  iconSize: [50, 50],
  iconAnchor: [25, 25],
  popupAnchor: [0, -25],
});

// 2. User Icon (Blue Pin)
const userIcon = L.icon({
  iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

function MapUpdater({ center }: { center: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    if (map && center) {
      map.setView([center.lat, center.lng]);
      map.invalidateSize();
    }
  }, [center, map]);
  return null;
}

export default function BookingMap({ userLocation, homeBase, radius }: any) {
  const defaultLat = 44.3894;
  const defaultLng = -79.6903;

  return (
    <MapContainer
      center={[
        userLocation?.lat || homeBase?.lat || defaultLat, 
        userLocation?.lng || homeBase?.lng || defaultLng
      ]}
      zoom={userLocation ? 11 : 9}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      
      {homeBase && (
        <>
          {/* Business Marker using the custom logo */}
          <Marker position={[homeBase.lat, homeBase.lng]} icon={businessIcon} />
          
          <Circle
            center={[homeBase.lat, homeBase.lng]}
            radius={radius * 1000}
            pathOptions={{ color: '#2563eb', fillOpacity: 0.1, weight: 1 }}
          />
        </>
      )}

      {userLocation && (
        <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon} />
      )}
      
      <MapUpdater center={userLocation || homeBase || { lat: defaultLat, lng: defaultLng }} />
    </MapContainer>
  );
}